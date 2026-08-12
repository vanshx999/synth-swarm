import { Task, Plan, Gap, Report, SwarmEvent, SwarmEventCallback, LLMProvider } from '../types';

const FALLBACK_REASONING =
  'Split into historical context, technical mechanism, current debates, and counterarguments — chosen to cover both factual grounding and contested framing.';

/**
 * Extract the first balanced JSON object/array from a blob of LLM output.
 * Strips markdown code fences and tolerates surrounding prose.
 */
function extractJson(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{' || cleaned[i] === '[') {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

export class SwarmEngine {
  private provider: LLMProvider;
  private onEvent: SwarmEventCallback;
  private maxLoops = 3;

  constructor(provider: LLMProvider, onEvent: SwarmEventCallback) {
    this.provider = provider;
    this.onEvent = onEvent;
  }

  private emit(event: SwarmEvent): void {
    this.onEvent(event);
  }

  /**
   * Decompose a topic into 5-7 tasks as a JSON Plan. Falls back to a fixed
   * plan when the LLM output cannot be parsed.
   */
  async plan(topic: string): Promise<Plan> {
    const prompt = `You are a research planner. Decompose the topic "${topic}" into 5 to 7 focused research tasks.

Output exactly one JSON object in this shape (no prose, no markdown):
{
  "tasks": [ { "id": "string", "title": "string" } ],
  "reasoning": "string"
}
Each task id must be unique. "reasoning" should briefly explain how the tasks cover the topic.`;

    let response: string;
    try {
      response = await this.provider.runAgent('planner', prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown planning error';
      this.emit({ type: 'error', message });
      const plan = this.fallbackPlan(topic);
      this.emit({ type: 'plan_ready', plan });
      return plan;
    }

    const plan = this.parsePlan(response, topic);
    this.emit({ type: 'plan_ready', plan });
    return plan;
  }

  private parsePlan(text: string, topic: string): Plan {
    const json = extractJson(text);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        if (parsed && Array.isArray(parsed.tasks)) {
          const tasks: Task[] = parsed.tasks
            .map((t: unknown, i: number): Task | null => {
              if (!t || typeof t !== 'object') return null;
              const obj = t as Record<string, unknown>;
              return {
                id: typeof obj.id === 'string' ? obj.id : `t${i + 1}`,
                title: typeof obj.title === 'string' ? obj.title : `Research task ${i + 1}`,
                status: 'pending',
              };
            })
            .filter((t: Task | null): t is Task => t !== null);

          if (tasks.length > 0) {
            return {
              tasks,
              reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
            };
          }
        }
      } catch {
        // fall through to fallback plan
      }
    }
    return this.fallbackPlan(topic);
  }

  private fallbackPlan(topic: string): Plan {
    return {
      tasks: [
        { id: 't1', title: `Historical context of ${topic}`, status: 'pending' },
        { id: 't2', title: `Technical mechanism of ${topic}`, status: 'pending' },
        { id: 't3', title: `Current debates around ${topic}`, status: 'pending' },
        { id: 't4', title: `Counterarguments to ${topic}`, status: 'pending' },
        { id: 't5', title: `Synthesis of ${topic}`, status: 'pending' },
      ],
      reasoning: FALLBACK_REASONING,
    };
  }

  /**
   * Run all tasks IN PARALLEL, emitting a task_update event for every
   * transition (pending -> working -> done/failed).
   */
  async swarmRunner(tasks: Task[]): Promise<void> {
    await Promise.all(tasks.map((task) => this.runTask(task)));
  }

  private async runTask(task: Task): Promise<void> {
    task.status = 'working';
    delete task.result;
    delete task.error;
    this.emit({ type: 'task_update', task: { ...task } });

    try {
      const result = await this.provider.runAgent('agent', task.title, (status) => {
        this.emit({ type: 'agent_thinking', taskId: task.id, status, timestamp: Date.now() });
      });
      task.status = 'done';
      task.result = result;
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Unknown error';
    }
    this.emit({ type: 'task_update', task: { ...task } });
  }

  /**
   * Ask the LLM to merge completed task results into a Report and to identify
   * remaining gaps. Emits gap_detected when gaps are found.
   */
  async synthesizer(tasks: Task[], loopNum: number): Promise<{ report: Report; gap?: Gap }> {
    const body =
      tasks
        .filter((t) => t.status === 'done' && t.result)
        .map((t) => `## ${t.title}\n${t.result}`)
        .join('\n\n---\n\n') || 'No completed research results were provided.';

    const prompt = `You are a report synthesizer. Merge the following research task results into a final report and identify any gaps that still need research. Identify what SPECIFIC aspects of the topic are NOT covered. Do NOT suggest generic categories — only name gaps specific to THIS topic.

Output exactly one JSON object in this shape (no prose, no markdown):
{
  "report": {
    "summary": "string",
    "sections": [ { "title": "string", "content": "string" } ]
  },
  "gap": {
    "missing": [ "string" ],
    "reasoning": "string"
  }
}
When the report is complete and no further research is needed, set "gap" to { "missing": [], "reasoning": "Complete" }.

Research results:
${body}`;

    let report: Report = this.fallbackReport(tasks, loopNum);
    let gap: Gap | undefined;

    try {
      const response = await this.provider.runAgent('synthesizer', prompt);
      const json = extractJson(response);
      if (json) {
        const parsed = JSON.parse(json);
        const reportRaw = parsed && typeof parsed === 'object' && parsed.report ? parsed.report : parsed;
        report = this.normalizeReport(reportRaw, loopNum);
        gap = this.normalizeGap(parsed?.gap ?? parsed?.gaps);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown synthesis error';
      this.emit({ type: 'error', message });
    }

    if (gap) {
      this.emit({ type: 'gap_detected', gap, loopNumber: loopNum });
    }
    return { report, gap };
  }

  private fallbackReport(tasks: Task[], loopNum: number): Report {
    const done = tasks.filter((t) => t.status === 'done' && t.result);
    return {
      summary:
        done.map((t) => t.title).join(', ') || 'No completed research results were available.',
      sections: done.map((t) => ({ title: t.title, content: t.result ?? '' })),
      loopsUsed: loopNum,
    };
  }

  private normalizeReport(value: unknown, loopNum: number): Report {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const summary = typeof obj.summary === 'string' ? obj.summary : '';
    const raw = Array.isArray(obj.sections) ? obj.sections : [];
    const sections = raw
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        title: typeof s.title === 'string' ? s.title : 'Section',
        content: typeof s.content === 'string' ? s.content : '',
      }));
    return { summary, sections, loopsUsed: loopNum };
  }

  private normalizeGap(value: unknown): Gap | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    const missing = Array.isArray(obj.missing)
      ? obj.missing.filter((m): m is string => typeof m === 'string')
      : [];
    if (missing.length === 0) return undefined;
    return {
      missing,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    };
  }

  /**
   * Spawn fresh tasks for uncovered gap topics, emit a redispatch event, and
   * run another swarm + synthesis pass.
   */
  async loop(topic: string, gap: Gap, loopNum: number): Promise<{ report: Report; gap?: Gap }> {
    if (!gap || gap.missing.length === 0) {
      throw new Error('No gaps to loop on');
    }
    if (loopNum >= this.maxLoops) {
      throw new Error(`Max loops (${this.maxLoops}) reached`);
    }

    const newTasks: Task[] = gap.missing.map((m, i) => ({
      id: `gap-${loopNum}-${i}`,
      title: `Follow-up: ${m}`,
      status: 'pending',
    }));

    this.emit({ type: 'redispatch', taskIds: newTasks.map((t) => t.id), loopNumber: loopNum });

    await this.swarmRunner(newTasks);
    const result = await this.synthesizer(newTasks, loopNum);
    return result;
  }

  /**
   * plan -> swarmRunner -> synth, then repeatedly loop while gaps remain and
   * the loop budget allows. Emits a final_report once complete or exhausted.
   */
  async run(topic: string): Promise<Report> {
    const plan = await this.plan(topic);
    const allTasks: Task[] = [...plan.tasks];

    await this.swarmRunner(plan.tasks);
    let result = await this.synthesizer(allTasks, 0);

    let loopNum = 0;
    while (result.gap && result.gap.missing.length > 0 && loopNum + 1 < this.maxLoops) {
      loopNum++;
      // Create gap tasks and run swarm on them
      const gapTasks: Task[] = result.gap.missing.map((m, i) => ({
        id: `gap-${loopNum}-${i}`,
        title: `Follow-up: ${m}`,
        status: 'pending' as const,
      }));
      this.emit({ type: 'redispatch', taskIds: gapTasks.map((t) => t.id), loopNumber: loopNum });
      await this.swarmRunner(gapTasks);

      // Accumulate all tasks and re-synthesize
      allTasks.push(...gapTasks);
      result = await this.synthesizer(allTasks, loopNum);
    }

    const report: Report = {
      ...result.report,
      loopsUsed: loopNum,
    };
    this.emit({ type: 'final_report', report });
    return report;
  }
}
