export interface SwarmTask {
  id: string;
  role: string;
  prompt: string;
  dependsOn?: string[];
}

export interface SwarmPlan {
  topic: string;
  tasks: SwarmTask[];
}

export interface AgentResult {
  taskId: string;
  role: string;
  content: string;
  status: 'working' | 'done' | 'failed';
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface SwarmState {
  plan: SwarmPlan | null;
  results: Map<string, AgentResult>;
  currentLoop: number;
  maxLoops: number;
  status: 'idle' | 'planning' | 'running' | 'synthesizing' | 'looping' | 'complete' | 'error';
  finalReport?: string;
}

export interface LLMProvider {
  name: string;
  runAgent(role: string, task: string): Promise<string>;
  isAvailable(): boolean;
}

export interface ProviderConfig {
  gemini?: { apiKey: string };
  groq?: { apiKey: string };
  demoMode: boolean;
}