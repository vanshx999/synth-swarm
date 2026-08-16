import {
  Task,
  Plan,
  Gap,
  Report,
  SwarmEvent,
  LLMProvider,
  SwarmEventCallback,
} from '../types';

const MAX_LOOPS = 3;

const FALLBACK_PLANNING_REASONING =
  'Split into historical context, technical mechanism, current debates, and counterarguments — chosen to cover both factual grounding and contested framing.';

function makeId(): string {
  return (
    't' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function stripCodeFences(raw: string): string {
  return raw.replace(/```(?:json)?/gi, '').trim();
}

export class SwarmEngine {
  private provider: LLMProvider;
  private onEvent: SwarmEventCallback;
  private tasks: Task[] = [];

  constructor(provider: LLMProvider, onEvent: SwarmEventCallback) {
    this.provider = provider;
    this.onEvent = onEvent;
  }

  private emit(event: SwarmEvent): void {
    this.onEvent(event);
  }

  async plan(topic: string): Promise<Plan> {
    const agentPrompt = [
      'You are a research planner. Decompose the given topic into 5-7 parallel research tasks.',
      `Topic: "${topic}"`,
      'Return ONLY valid JSON matching this shape:',
      '{"tasks":[{"id":"t1","title":"...","status":"pending"}],"reasoning":"..."}',
      'Each task needs a unique id, a title, and status "pending".',
    ].join('\n');

    let plan: Plan;
    try {
      const response = await this.provider.runAgent('planner', agentPrompt);
      plan = this.parsePlan(response);
      if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
        throw new Error('Planner returned no tasks');
      }
    } catch {
      plan = this.fallbackPlan();
    }

    this.emit({ type: 'plan_ready', plan });
    return plan;
  }

  private parsePlan(raw: string): Plan {
    const parsed = JSON.parse(stripCodeFences(raw));
    const tasks: Task[] = (parsed.tasks ?? []).map(
      (t: { id?: unknown; title?: unknown }) => ({
        id: typeof t.id === 'string' && t.id ? t.id : makeId(),
        title:
          typeof t.title === 'string' && t.title ? t.title : String(t.id ?? 'task'),
        status: 'pending',
      })
    );
    return {
      tasks,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  }

  private fallbackPlan(): Plan {
    const tasks: Task[] = [
      { id: 't1', title: 'Historical context', status: 'pending' },
      { id: 't2', title: 'Technical mechanism', status: 'pending' },
      { id: 't3', title: 'Current debates', status: 'pending' },
      { id: 't4', title: 'Counterarguments', status: 'pending' },
      { id: 't5', title: 'Synthesis and outlook', status: 'pending' },
    ];
    return { tasks, reasoning: FALLBACK_PLANNING_REASONING };
  }

  async swarmRunner(tasks: Task[]): Promise<Task[]> {
    await Promise.all(
      tasks.map(async (task) => {
        task.status = 'working';
        this.emit({ type: 'task_update', task: { ...task } });
        try {
          const result = await this.provider.runAgent(task.title, task.title);
          task.status = 'done';
          task.result = result;
          delete task.error;
        } catch (error) {
          task.status = 'failed';
          task.error = error instanceof Error ? error.message : String(error);
          delete task.result;
        }
        this.emit({ type: 'task_update', task: { ...task } });
      })
    );
    return tasks;
  }

  async synthesizer(
    tasks: Task[],
    loopNum: number
  ): Promise<{ report: Report; gap: Gap }> {
    const doneResults = tasks
      .filter((t) => t.status === 'done' && t.result)
      .map((t) => `## ${t.title}\n${t.result}`)
      .join('\n\n---\n\n');

    const agentPrompt = [
      'Synthesize the following research results into a final report and identify coverage gaps.',
      'Research results:',
      doneResults || '(no successful results)',
      'Return ONLY valid JSON matching this shape:',
      `{"report":{"summary":"...","sections":[{"title":"...","content":"..."}],"loopsUsed":${loopNum}},"gap":{"missing":["..."],"reasoning":"..."}}`,
      'The "report" must include summary, an array of sections each with title and content, and loopsUsed set to the current loop number. The "gap" lists missing topics in "missing" (an empty array if the topic is fully covered) plus reasoning.',
    ].join('\n');

    let report: Report;
    let gap: Gap;
    try {
      const response = await this.provider.runAgent('writer', agentPrompt);
      const parsed = this.parseReport(response, loopNum);
      report = parsed.report;
      gap = parsed.gap;
    } catch {
      report = {
        summary: doneResults,
        sections: [],
        loopsUsed: loopNum,
      };
      gap = { missing: [], reasoning: '' };
    }

    if (gap.missing.length > 0) {
      this.emit({ type: 'gap_detected', gap, loopNumber: loopNum });
    }
    return { report, gap };
  }

  private parseReport(
    raw: string,
    loopNum: number
  ): { report: Report; gap: Gap } {
    const parsed = JSON.parse(stripCodeFences(raw));
    const r = parsed.report ?? parsed;
    const g = parsed.gap ?? parsed;
    return {
      report: {
        summary: typeof r.summary === 'string' ? r.summary : '',
        sections: Array.isArray(r.sections) ? r.sections : [],
        loopsUsed: typeof r.loopsUsed === 'number' ? r.loopsUsed : loopNum,
      },
      gap: {
        missing: Array.isArray(g.missing) ? g.missing : [],
        reasoning: typeof g.reasoning === 'string' ? g.reasoning : '',
      },
    };
  }

  async loop(
    topic: string,
    gap: Gap,
    loopNum: number
  ): Promise<{ report: Report; gap: Gap }> {
    const newTasks: Task[] = (gap.missing || []).map((missing, i) => ({
      id: `loop${loopNum}-${i}-${makeId()}`,
      title: `${missing} (${topic})`,
      status: 'pending',
    }));

    this.emit({
      type: 'redispatch',
      taskIds: newTasks.map((t) => t.id),
      loopNumber: loopNum,
    });

    await this.swarmRunner(newTasks);
    this.tasks = this.tasks.concat(newTasks);
    return this.synthesizer(this.tasks, loopNum);
  }

  async run(topic: string): Promise<Report> {
    const plan = await this.plan(topic);
    this.tasks = plan.tasks;
    await this.swarmRunner(this.tasks);
    let { report, gap } = await this.synthesizer(this.tasks, 0);

    let loopNum = 1;
    while (gap.missing.length > 0 && loopNum < MAX_LOOPS) {
      const looped = await this.loop(topic, gap, loopNum);
      report = looped.report;
      gap = looped.gap;
      loopNum++;
    }

    this.emit({ type: 'final_report', report });
    return report;
  }
}
