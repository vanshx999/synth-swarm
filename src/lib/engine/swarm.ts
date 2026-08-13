import { Task, Plan, Gap, Report, SwarmEvent, SwarmEventCallback, LLMProvider } from '../types';
import { classifyTopic } from '../topic';

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
  private maxLoops = 2;

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
    // Use the deterministic, topic-aware plan every time. It frees the runtime
    // budget for the researcher + synthesizer calls that actually need the LLM,
    // and guarantees a plan even when Groq is mid-throttle.
    const plan = this.fallbackPlan(topic);
    this.emit({ type: 'plan_ready', plan });
    return plan;
  }

  private fallbackPlan(topic: string): Plan {
    // Even when the LLM output is unparseable, build a plan tailored to the
    // topic's type (definitional / entity / market / comparison / general)
    // rather than stamping one fixed template onto everything.
    const profile = classifyTopic(topic);
    return {
      tasks: profile.angles.map((angle, i) => ({
        id: `t${i + 1}`,
        title: angle.title,
        status: 'pending' as const,
      })),
      reasoning: profile.reasoning,
    };
  }

  /**
   * Run all tasks IN PARALLEL, emitting a task_update event for every
   * transition (pending -> working -> done/failed). Concurrency is capped so
   * bursts don't trip the Groq rate limits.
   */
  async swarmRunner(tasks: Task[]): Promise<void> {
    // Drive parallel searches per run while keeping Groq request bursts bounded.
    const maxConcurrent = Math.min(4, tasks.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor++];
        await this.runTask(task);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, maxConcurrent) }, () => worker())
    );
  }

  private async runTask(task: Task): Promise<void> {
    task.status = 'working';
    delete task.result;
    delete task.error;
    this.emit({ type: 'task_update', task: { ...task } });

    try {
      const result = await this.provider.runAgent(
        'agent',
        task.title,
        (status) => {
          this.emit({ type: 'agent_thinking', taskId: task.id, status, timestamp: Date.now() });
        },
        (sources) => {
          task.sources = sources;
        }
      );
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
  async synthesizer(tasks: Task[], loopNum: number, topic: string): Promise<{ report: Report; gap?: Gap }> {
const body =
    tasks
      .filter((t) => t.status === 'done' && t.result)
      .map((t) => {
        const result = t.result!.replace(/\s+/g, ' ').trim();
        return `## ${t.title}\n${result.slice(0, 1500)}${result.length > 1500 ? '…' : ''}`;
      })
      .join('\n\n---\n\n') || 'No completed research results were provided.';

    const prompt = `Topic: ${topic}

You are a report synthesizer. Merge the following research task results into a final report that directly answers this topic, and identify any gaps that still need research. Only name gaps SPECIFIC to this topic — never generic categories. If the results already answer the topic well, set "gap" to { "missing": [], "reasoning": "Complete" } so the loop stops.

DO NOT propose generic gaps such as "broader impact", "future outlook", "comparison with other frameworks", "deeper analysis", "real-world applications", or "more context". A gap must be a concrete, named subject the research entirely omits. When in doubt, set "missing" to [] — extra loops are worse than none.

Output exactly one JSON object in this shape (no prose, no markdown):
{
  "report": {
    "title": "string",
    "summary": "string",
    "sections": [ { "title": "string", "content": "string" } ]
  },
  "gap": {
    "missing": [ "string" ],
    "reasoning": "string"
  }
}
"title" must be a short, topic-accurate title generated from the topic itself — never scraped from a source article.

Research results:
${body}`;

    let report: Report = this.fallbackReport(tasks, loopNum, topic);
    let gap: Gap | undefined;

    try {
      const response = await this.provider.runAgent('synthesizer', prompt);
      const json = extractJson(response);
      if (json) {
        const parsed = JSON.parse(json);
        const reportRaw = parsed && typeof parsed === 'object' && parsed.report ? parsed.report : parsed;
        report = this.normalizeReport(reportRaw, loopNum, topic);
        gap = this.normalizeGap(parsed?.gap ?? parsed?.gaps);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown synthesis error';
      this.emit({ type: 'error', message });
      // If the primary (premium) synthesis was throttled, re-synthesize on the
      // fast research model so the demo still ships a real report instead of
      // a raw-source fallback.
      try {
        const response = await this.provider.runAgent('synthesizer-fallback', prompt);
        const json = extractJson(response);
        if (json) {
          const parsed = JSON.parse(json);
          const reportRaw = parsed && typeof parsed === 'object' && parsed.report ? parsed.report : parsed;
          report = this.normalizeReport(reportRaw, loopNum, topic);
          gap = this.normalizeGap(parsed?.gap ?? parsed?.gaps);
        }
      } catch (fallbackError) {
        // Keep the raw-source fallback report; the run still completes.
      }
    }

    if (gap) {
      this.emit({ type: 'gap_detected', gap, loopNumber: loopNum });
    }
    return { report, gap };
  }

  private fallbackReport(tasks: Task[], loopNum: number, topic: string): Report {
    const done = tasks.filter((t) => t.status === 'done' && t.result);
    const sections: { title: string; content: string }[] = done.map((t) => ({
      title: t.title,
      content: t.result ?? '',
    }));

    // If AI synthesis/research failed (e.g. rate limited), never return a dead
    // end — compile the raw web sources the swarm already gathered.
    if (sections.length === 0) {
      const sourced = tasks.filter((t) => (t.sources?.length ?? 0) > 0);
      for (const t of sourced) {
        const content = (t.sources ?? [])
          .map((s) => (s.snippet ? `- ${s.snippet.replace(/\s+/g, ' ').trim()}` : `- ${s.title}: ${s.url}`))
          .slice(0, 4)
          .join('\n');
        if (content) sections.push({ title: t.title, content });
      }
    }

    return {
      title: classifyTopic(topic).title || topic || 'Synth Report',
      summary:
        sections.length > 0
          ? done.length > 0
            ? done.map((t) => t.title).join(', ')
            : 'Compiled directly from the web sources the swarm gathered (AI synthesis was rate-limited).'
          : 'No completed research results were available.',
      sections,
      loopsUsed: loopNum,
    };
  }

  private normalizeReport(value: unknown, loopNum: number, topic: string): Report {
    const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const raw = Array.isArray(obj.sections) ? obj.sections : [];
    const sections = raw
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
      .map((s) => ({
        title: typeof s.title === 'string' ? s.title : 'Section',
        content: typeof s.content === 'string' ? s.content : '',
      }))
      .filter((s) => s.content.trim().length > 0);
    // Never let a hallucinated/empty "report" replace real research.
    if (sections.length === 0) throw new Error('Synthesis returned no usable sections');
    const title =
      typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : classifyTopic(topic).title;
    const summary = typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : sections[0].title;
    return { title, summary, sections, loopsUsed: loopNum };
  }

  private normalizeGap(value: unknown): Gap | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const obj = value as Record<string, unknown>;
    const missing = Array.isArray(obj.missing)
      ? obj.missing
          .filter((m): m is string => typeof m === 'string')
          .filter((m) => !this.isGenericGap(m))
          .slice(0, 3)
      : [];
    if (missing.length === 0) return undefined;
    return {
      missing,
      reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
    };
  }

  /** Reject vague gap candidates that would loop forever without adding value. */
  private isGenericGap(text: string): boolean {
    const t = text.toLowerCase();
    const generic = [
      'broader impact',
      'wider impact',
      'overall impact',
      'general impact',
      'broader',
      'wider',
      'more depth',
      'more detail',
      'deeper analysis',
      'further analysis',
      'further exploration',
      'more context',
      'specific context',
      'subject matter',
      'other frameworks',
      'alternatives',
      'alternative',
      'future outlook',
      'future trends',
      'future developments',
      'emerging',
      'real-world applications',
      'applications beyond',
      'beyond its current',
      'as a whole',
      'a comparison',
    ];
    return (
      t.length < 12 ||
      generic.some((g) => t.includes(g)) ||
      /(impact|implications?) on/.test(t)
    );
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
    const result = await this.synthesizer(newTasks, loopNum, topic);
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
    let result = await this.synthesizer(allTasks, 0, topic);

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
      result = await this.synthesizer(allTasks, loopNum, topic);
    }

    const report: Report = {
      ...result.report,
      loopsUsed: loopNum,
    };
    this.emit({ type: 'final_report', report });
    return report;
  }
}
