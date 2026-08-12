import { SwarmPlan, SwarmTask, AgentResult, SwarmState, LLMProvider } from '../types';
import { createProviders, ProviderConfig } from './providers';

export class SwarmEngine {
  private providers: LLMProvider[];
  private state: SwarmState;
  private onUpdate: (state: SwarmState) => void;

  constructor(config: ProviderConfig, onUpdate: (state: SwarmState) => void) {
    this.providers = createProviders(config);
    this.onUpdate = onUpdate;
    this.state = this.initialState();
  }

  private initialState(): SwarmState {
    return {
      plan: null,
      results: new Map(),
      currentLoop: 0,
      maxLoops: 3,
      status: 'idle',
    };
  }

  getState(): SwarmState {
    return { ...this.state, results: new Map(this.state.results) };
  }

  async run(topic: string): Promise<string> {
    this.state.status = 'planning';
    this.emit();

    // Step 1: Plan
    const plan = await this.plan(topic);
    this.state.plan = plan;
    this.state.status = 'running';
    this.emit();

    // Step 2: Run loops
    while (this.state.currentLoop < this.state.maxLoops) {
      await this.executeSwarm(plan);
      
      this.state.status = 'synthesizing';
      this.emit();
      
      const report = await this.synthesize(plan);
      this.state.finalReport = report;
      
      // Check if we need another loop (simple heuristic: if report is short or has "gap")
      if (this.state.currentLoop < this.state.maxLoops - 1 && this.needsAnotherLoop(report)) {
        this.state.currentLoop++;
        this.state.status = 'looping';
        this.emit();
        // Re-plan with gap awareness
        plan.tasks = await this.replanWithGaps(topic, report);
        continue;
      }
      break;
    }

    this.state.status = 'complete';
    this.emit();
    return this.state.finalReport || '';
  }

  private async plan(topic: string): Promise<SwarmPlan> {
    const provider = this.getAvailableProvider();
    const plannerPrompt = `Topic: "${topic}"
    
Decompose this into 5-7 parallel research tasks. Each task needs:
- id: unique string (t1, t2...)
- role: "researcher" | "analyst" | "writer"  
- prompt: specific instruction for that agent
- dependsOn: array of task ids this depends on (empty for parallel root tasks)

Output ONLY a valid JSON array. Example:
[{"id":"t1","role":"researcher","prompt":"Research X","dependsOn":[]},{"id":"t2","role":"analyst","prompt":"Synthesize t1","dependsOn":["t1"]}]`;

    const response = await provider.runAgent('planner', plannerPrompt);
    let tasks: SwarmTask[];
    try {
      tasks = JSON.parse(response);
    } catch {
      // Fallback plan
      tasks = this.fallbackPlan(topic);
    }
    return { topic, tasks };
  }

  private fallbackPlan(topic: string): SwarmTask[] = [
    { id: 't1', role: 'researcher', prompt: `Research current landscape of ${topic}: key players, funding, trends`, dependsOn: [] },
    { id: 't2', role: 'researcher', prompt: `Analyze market dynamics and competitive landscape for ${topic}`, dependsOn: [] },
    { id: 't3', role: 'researcher', prompt: `Identify regulatory, technical, or adoption challenges for ${topic}`, dependsOn: [] },
    { id: 't4', role: 'analyst', prompt: `Synthesize findings from t1, t2, t3 into strategic insights for ${topic}`, dependsOn: ['t1', 't2', 't3'] },
    { id: 't5', role: 'writer', prompt: `Write executive report from synthesized analysis on ${topic}`, dependsOn: ['t4'] },
  ];

  private async executeSwarm(plan: SwarmPlan): Promise<void> {
    const completed = new Set<string>();
    
    while (completed.size < plan.tasks.length) {
      const ready = plan.tasks.filter(t => 
        !completed.has(t.id) && 
        (t.dependsOn?.every(d => completed.has(d)) ?? true)
      );
      
      if (ready.length === 0) break; // circular dep protection
      
      // Run ready tasks in parallel
      await Promise.all(ready.map(task => this.runTask(task)));
      ready.forEach(t => completed.add(t.id));
      this.emit();
    }
  }

  private async runTask(task: SwarmTask): Promise<void> {
    const provider = this.getAvailableProvider();
    
    this.state.results.set(task.id, {
      taskId: task.id,
      role: task.role,
      content: '',
      status: 'working',
      startedAt: Date.now(),
    });
    this.emit();

    try {
      const content = await provider.runAgent(task.role, task.prompt);
      this.state.results.set(task.id, {
        taskId: task.id,
        role: task.role,
        content,
        status: 'done',
        startedAt: this.state.results.get(task.id)?.startedAt || Date.now(),
        completedAt: Date.now(),
      });
    } catch (error) {
      this.state.results.set(task.id, {
        taskId: task.id,
        role: task.role,
        content: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        startedAt: this.state.results.get(task.id)?.startedAt || Date.now(),
        completedAt: Date.now(),
      });
    }
    this.emit();
  }

  private async synthesize(plan: SwarmPlan): Promise<string> {
    const provider = this.getAvailableProvider();
    const completedResults = Array.from(this.state.results.values())
      .filter(r => r.status === 'done')
      .map(r => `## ${r.role.toUpperCase()} (${r.taskId})\n${r.content}`)
      .join('\n\n---\n\n');

    const prompt = `Previous research results:\n${completedResults}\n\nWrite a comprehensive executive report synthesizing all findings. Include: bottom line, key findings with data, strategic implications, outlook.`;
    
    return provider.runAgent('writer', prompt);
  }

  private needsAnotherLoop(report: string): boolean {
    return report.length < 2000 || report.toLowerCase().includes('gap') || report.toLowerCase().includes('missing');
  }

  private async replanWithGaps(topic: string, previousReport: string): Promise<SwarmTask[]> {
    const provider = this.getAvailableProvider();
    const prompt = `Previous report had gaps. Topic: "${topic}"
Previous report:\n${previousReport}\n\nCreate 2-3 NEW research tasks to fill gaps. Output ONLY JSON array of tasks with id, role, prompt, dependsOn.`;
    
    const response = await provider.runAgent('planner', prompt);
    try {
      return JSON.parse(response);
    } catch {
      return [];
    }
  }

  private getAvailableProvider(): LLMProvider {
    const available = this.providers.find(p => p.isAvailable());
    if (!available) throw new Error('No LLM provider available');
    return available;
  }

  private emit(): void {
    this.onUpdate(this.getState());
  }
}

export function createEngine(config: ProviderConfig, onUpdate: (state: SwarmState) => void): SwarmEngine {
  return new SwarmEngine(config, onUpdate);
}