export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'working' | 'done' | 'failed';
  result?: string;
  error?: string;
  sources?: Source[];
  thinking?: string;
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Plan {
  tasks: Task[];
  reasoning: string;
}

export interface Gap {
  missing: string[];
  reasoning: string;
}

export interface Report {
  title: string;
  summary: string;
  sections: { title: string; content: string }[];
  loopsUsed: number;
}

export type SwarmEvent =
  | { type: 'plan_ready'; plan: Plan }
  | { type: 'task_update'; task: Task }
  | { type: 'gap_detected'; gap: Gap; loopNumber: number }
  | { type: 'redispatch'; taskIds: string[]; loopNumber: number }
  | { type: 'final_report'; report: Report }
  | { type: 'error'; message: string }
  | { type: 'agent_thinking'; taskId: string; status: string; timestamp: number };

export interface LLMProvider {
  name: string;
  runAgent(
    role: string,
    task: string,
    onThinking?: (status: string) => void,
    onSources?: (sources: Source[]) => void
  ): Promise<string>;
  isAvailable(): boolean;
}

export interface ProviderConfig {
  groqApiKey?: string;
  exaApiKey?: string;
  searchProvider?: SearchProvider;
}

export type SearchProvider = 'tavily' | 'exa';

export type SwarmEventCallback = (event: SwarmEvent) => void;
