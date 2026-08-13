import { LLMProvider, ProviderConfig, SearchProvider, Source } from '@/lib/types';

// ---------------------------------------------------------------------------
// Tavily Search
// ---------------------------------------------------------------------------

const searchCache = new Map<string, { sources: Source[]; cachedAt: number }>();
const SEARCH_CACHE_TTL = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_LIMIT = 20;

function getCachedSearch(query: string, provider: SearchProvider): Source[] | null {
  const key = `${provider}:${query.trim().toLowerCase()}`;
  const cached = searchCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > SEARCH_CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return cached.sources;
}

function cacheSearch(query: string, provider: SearchProvider, sources: Source[]): void {
  const key = `${provider}:${query.trim().toLowerCase()}`;
  searchCache.set(key, { sources, cachedAt: Date.now() });
  while (searchCache.size > SEARCH_CACHE_LIMIT) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
    else break;
  }
}

function searchDepth(query: string): 'basic' | 'advanced' {
  return /(compare|vs|state of|analysis)/i.test(query) ? 'advanced' : 'basic';
}

async function searchTavily(query: string): Promise<Source[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, api_key: apiKey, search_depth: searchDepth(query), max_results: 5 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.snippet || r.content || '',
    }));
  } catch {
    return [];
  }
}

async function searchExa(query: string, apiKey: string): Promise<Source[]> {
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ query, type: 'neural', numResults: 10, contents: { text: true } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      title: r.title || r.url || '',
      url: r.url || '',
      snippet: r.text || r.snippet || '',
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourcesToContext(sources: Source[]): string {
  return sources
    .map((s, i) => {
      const snippet = s.snippet.length > 500 ? `${s.snippet.slice(0, 500)}…` : s.snippet;
      return `[${i + 1}] ${s.title}\nURL: ${s.url}\nSnippet: ${snippet}`;
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// GroqProvider
// ---------------------------------------------------------------------------

export class GroqProvider implements LLMProvider {
  name = 'groq';

  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  private model = 'llama-3.1-8b-instant';
  private exaApiKey: string;
  private searchProvider: SearchProvider;
  private modelPrompts: Record<string, { prompts: Record<string, string>; researcherMaxTokens: number; synthesizerMaxTokens: number; plannerMaxTokens: number }> = {
    'llama-3.3-70b-versatile': {
      prompts: {
        planner: 'You are a world-class research director. Decompose the topic into 5-7 distinct research angles that together provide complete coverage. Each task must have a clear, specific research question as the title. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
        researcher: 'You are an expert research analyst. Provide a detailed, well-structured research brief with specific facts, figures, names, dates, and data points. Be comprehensive — aim for 3-5 paragraphs with concrete evidence. Cite specific companies, people, events, statistics where relevant. Do NOT give generic advice — give specific, cited findings. Cite the search result sources in your response.',
        synthesizer: 'You are an executive research director. Synthesize ALL provided research into a tight executive report with a short topic-accurate "title". After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, never generic categories, and set "missing" to [] when coverage is already good. Create a JSON object with "title", "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      },
      researcherMaxTokens: 1100,
      synthesizerMaxTokens: 900,
      plannerMaxTokens: 900,
    },
    'llama-3.1-8b-instant': {
      prompts: {
        planner: 'Use the deterministic planner; do not call an LLM planner.',
        researcher: 'Provide a concise research brief with concrete facts, dates, names, and figures supported by the search results. Avoid generic advice and cite the sources.',
        synthesizer: 'Synthesize the supplied research into concise valid JSON with title, summary, sections [{title, content}], and gaps {missing, reasoning}. Use only topic-specific gaps; use an empty missing array when complete. Output JSON only.',
      },
      researcherMaxTokens: 800,
      synthesizerMaxTokens: 700,
      plannerMaxTokens: 900,
    },
  };

  constructor(apiKey: string, config: Pick<ProviderConfig, 'exaApiKey' | 'searchProvider'> = {}) {
    this.apiKey = apiKey;
    this.exaApiKey = config.exaApiKey ?? '';
    this.searchProvider = config.searchProvider ?? 'tavily';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  /** Retry transient Groq failures (429 / 5xx), honoring Retry-After on 429. */
  private async fetchRetry(init: RequestInit): Promise<Response> {
    const MAX_ATTEMPTS = 12;
    let attempt = 0;
    for (;;) {
      const response = await fetch(this.baseUrl, init);
      const status = response.status;
      const retriable = status === 429 || status === 500 || status === 503;
      attempt++;
      if (!retriable || attempt >= MAX_ATTEMPTS) return response;

      let delay: number;
      if (status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        // Retry-After is in seconds; cap so the run still progresses.
        delay = retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : 1000;
      } else {
        delay = Math.pow(1.9, attempt) * 1000 + Math.random() * 500;
      }
      await new Promise<void>((r) => setTimeout(r, delay));
    }
  }

  async runAgent(
    role: string,
    task: string,
    onThinking?: (s: string) => void,
    onSources?: (sources: Source[]) => void
  ): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Groq API key not configured');
    }

    const isPlanner = role.includes('plan');
    const isSynthesizer = role === 'synthesizer' || role === 'writer';
    const modelConfig = this.modelPrompts[this.model] ?? this.modelPrompts['llama-3.3-70b-versatile'];
    const effectiveMaxTokens = isSynthesizer
      ? modelConfig.synthesizerMaxTokens
      : isPlanner
        ? modelConfig.plannerMaxTokens
        : modelConfig.researcherMaxTokens;

    // For synthesizer, the task IS the full synthesis prompt with all research results
    // Do NOT search Tavily - use the provided research directly
    if (isSynthesizer) {
      onThinking?.('synthesizing...');

      const systemPrompt =
        `${this.getSystemPrompt(role)}\n\nWrite a tight executive answer under 400 words total. Do NOT list or repeat raw findings — synthesize them. Structure: (1) a short, topic-accurate "title" (e.g. "What is Kanban?"), (2) a 2-3 sentence direct answer to the topic up top, then (3) 3-5 short thematic sections (merge overlapping findings, do NOT write one section per research task), each 2-4 sentences MAX, in your own words. Cut anything not essential to directly answering the topic. Output ONLY valid JSON with "title", "summary" (the 2-3 sentence direct answer), "sections" array [{title, content}], and "gaps": {"missing": string[], "reasoning": string}. Only name gaps genuinely missing for THIS topic — when the research already answers the topic well, set "missing" to [] so the loop can stop.`;

      onThinking?.('drafting report...');

      const response = await this.fetchRetry({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task }, // task = full synthesis prompt with all research
          ],
          temperature: 0.3,
          max_tokens: effectiveMaxTokens,
        }),
      });

      if (!response.ok) {
        const detail = response.statusText ? ` (${response.statusText})` : '';
        throw new Error(`Groq API error: received status ${response.status}${detail}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Groq API returned an unexpected response shape');
      }
      return content;
    }

    // For planner and researcher: do Tavily search
    let searchQuery = task
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/^Follow-up:\s*/i, '')
      .trim();
    if (isPlanner) {
      const topicMatch = task.match(/"([^"]+)"/);
      searchQuery = topicMatch ? topicMatch[1] : task;
    }

    onThinking?.('searching...');

    const cachedSources = getCachedSearch(searchQuery, this.searchProvider);
    const sources = cachedSources ?? (this.searchProvider === 'exa'
      ? await searchExa(searchQuery, this.exaApiKey)
      : await searchTavily(searchQuery));
    if (!cachedSources) cacheSearch(searchQuery, this.searchProvider, sources);
    onSources?.(sources);

    onThinking?.(`found ${sources.length} results`);

    onThinking?.('drafting...');

    const searchContext =
      sources.length > 0
        ? `Search results for context:\n${sourcesToContext(sources)}`
        : 'No search results were found for this query.';

    const systemPrompt =
      `${this.getSystemPrompt(role)}\n\nOnly make claims supported by the provided search results. If results don't cover something, state that explicitly.`;

    const response = await this.fetchRetry({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${searchContext}\n\nTask: ${task}` },
        ],
        temperature: 0.3,
        max_tokens: effectiveMaxTokens,
      }),
    });

    if (!response.ok) {
      const detail = response.statusText ? ` (${response.statusText})` : '';
      throw new Error(`Groq API error: received status ${response.status}${detail}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Groq API returned an unexpected response shape');
    }
    return content;
  }

  getSystemPrompt(role: string): string {
    const modelConfig = this.modelPrompts[this.model] ?? this.modelPrompts['llama-3.3-70b-versatile'];
    const configuredPrompt = modelConfig.prompts[
      role === 'agent' ? 'researcher' : role === 'writer' ? 'synthesizer' : role
    ];
    if (configuredPrompt) return configuredPrompt;
    const prompts: Record<string, string> = {
      planner:
        'You are a world-class research director. Decompose the topic into 5-7 distinct research angles that together provide complete coverage. Each task must have a clear, specific research question as the title. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
      researcher:
        'You are an expert research analyst. Provide a detailed, well-structured research brief with specific facts, figures, names, dates, and data points. Be comprehensive — aim for 3-5 paragraphs with concrete evidence. Cite specific companies, people, events, statistics where relevant. Do NOT give generic advice — give specific, cited findings. Cite the search result sources in your response.',
      analyst:
        'You are a strategic analyst. Synthesize findings across multiple research sources, identify cross-cutting patterns, and surface non-obvious connections. Ground all claims in provided search results.',
      synthesizer:
        'You are an executive research director. Synthesize ALL provided research into a tight executive report with a short topic-accurate "title". After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, never generic categories, and set "missing" to [] when coverage is already good. Create a JSON object with "title", "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      writer:
        'You are an executive research director. Synthesize ALL provided research into a tight executive report with a short topic-accurate "title". After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, never generic categories, and set "missing" to [] when coverage is already good. Create a JSON object with "title", "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
    };
    return prompts[role] || prompts.researcher;
  }
}

// ---------------------------------------------------------------------------
// Provider factory — Groq is the only provider.
// ---------------------------------------------------------------------------

export function getProvider(config: ProviderConfig): LLMProvider {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }
  return new GroqProvider(config.groqApiKey, config);
}
