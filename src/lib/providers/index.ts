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
  return /(compare|vs|state of|analysis|latest|model|framework|startup|funding)/i.test(query) ? 'advanced' : 'basic';
}

/** Tavily freshness filter (in days) for queries that care about the current release/version. */
function searchRecencyDays(query: string): number | undefined {
  return /(latest|newest|current|new |recent|kimi|gpt-|claude|gemini|released|launched|2024|2025|2026|model)/i.test(query)
    ? 180
    : undefined;
}

async function searchTavily(query: string): Promise<Source[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const body: Record<string, unknown> = {
      query,
      api_key: apiKey,
      search_depth: searchDepth(query),
      max_results: 5,
    };
    const days = searchRecencyDays(query);
    if (days) body.days = days;
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

function todayString(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Keep models anchored to the present and to their freshest sources. */
function freshnessDirective(): string {
  return `Today's date is ${todayString()}. The search results may be much fresher than your training data. Prefer them and the most recent information they contain. If this subject has versions, releases, or a current model line-up, report the LATEST one as of today and state its release/recency explicitly. If the sources are too old to confirm the latest, say so instead of guessing.`;
}

function sourcesToContext(sources: Source[]): string {
  return sources
    .map((s, i) => {
      const snippet = s.snippet.length > 500 ? `${s.snippet.slice(0, 500)}…` : s.snippet;
      return `[${i + 1}] ${s.title}\nURL: ${s.url}\nSnippet: ${snippet}`;
    })
    .join('\n\n');
}

/**
 * Reasoning models (Qwen3, DeepSeek-R1, GPT-OSS) emit their chain-of-thought
 * between `<think>` / `<thinking>` tags before the real answer. Strip those
 * blocks (and any leftover bare tags) so the reasoning never leaks into task
 * results or the synthesized report.
 */
export function stripReasoning(text: string): string {
  let out = text;
  out = out.replace(/<think>[\s\S]*?<\/think>/g, '');
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  out = out.replace(/<\/?think>/g, '');
  out = out.replace(/<\/?thinking>/g, '');
  return out.trim();
}

// ---------------------------------------------------------------------------
// GroqProvider
// ---------------------------------------------------------------------------

export class GroqProvider implements LLMProvider {
  name = 'groq';

  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  // Final synthesis stays on the high-quality model; per-task research drafts
  // run on a faster model so a multi-task swarm fits the demo window.
  private model = 'llama-3.3-70b-versatile';
  private researchModel = 'qwen/qwen3.6-27b';
  // Premium synthesis chain: try each in order so a model whose daily token
  // quota is exhausted (common at demos) fails fast and the next takes over.
  private synthesisModels = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'];
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
    'qwen/qwen3.6-27b': {
      prompts: {
        planner: 'Use the deterministic planner; do not call an LLM planner.',
        researcher: 'Provide a precise, concise research brief with concrete facts, dates, names, and figures supported ONLY by the search results. Avoid generic advice and never invent details — cite the sources. 2-3 short paragraphs max.',
        synthesizer: 'Synthesize the supplied research into concise valid JSON with title, summary, sections [{title, content}], and gaps {missing, reasoning}. Use only topic-specific gaps; use an empty missing array when complete. Output JSON only.',
      },
      researcherMaxTokens: 800,
      synthesizerMaxTokens: 700,
      plannerMaxTokens: 900,
    },
    'openai/gpt-oss-120b': {
      prompts: {
        planner: 'You are a world-class research director. Decompose the topic into 5-7 distinct research angles that together provide complete coverage. Each task must have a clear, specific research question as the title. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
        researcher: 'You are an expert research analyst. Provide a detailed, well-structured research brief with specific facts, figures, names, dates, and data points. Be comprehensive — aim for 3-5 paragraphs with concrete evidence. Cite specific companies, people, events, statistics where relevant. Do NOT give generic advice — give specific, cited findings. Cite the search result sources in your response.',
        synthesizer: 'You are an executive research director. Synthesize ALL provided research into a tight executive report with a short topic-accurate "title". After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, never generic categories, and set "missing" to [] when coverage is already good. Create a JSON object with "title", "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      },
      researcherMaxTokens: 1100,
      synthesizerMaxTokens: 900,
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
  private async fetchRetry(init: RequestInit, maxAttempts = 12): Promise<Response> {
    const MAX_ATTEMPTS = maxAttempts;
    let attempt = 0;
    for (;;) {
      const response = await fetch(this.baseUrl, init);
      const status = response.status;
      const retriable = status === 429 || status === 500 || status === 503;
      attempt++;
      if (!retriable || attempt >= MAX_ATTEMPTS) return response;

      let delay: number;
      if (status === 429) {
        // A daily-token-exhaustion 429 will NOT clear within the run — don't
        // burn minutes sleeping on it; the synthesis chain moves to the next
        // model immediately instead.
        const bodyText = await response.clone().text();
        if (/tokens per day|tpd|daily limit|too many requests today/i.test(bodyText)) {
          return response;
        }
        const retryAfter = Number(response.headers.get('retry-after'));
        // Retry-After is in seconds; cap so the run still progresses.
        delay = retryAfter > 0 ? Math.min(retryAfter, 15) * 1000 : 1000 * attempt;
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
    // 'synthesizer-fallback' forces the fast research model so a throttled
    // premium model never leaves the demo with a raw-source report.
    const fastSynthesis = role === 'synthesizer-fallback';
    const isSynthesizer = fastSynthesis || role === 'synthesizer' || role === 'writer';
    const synthesisCandidates = fastSynthesis
      ? [this.researchModel]
      : [...this.synthesisModels, this.researchModel];
    const researchConfig = this.modelPrompts[this.researchModel] ?? this.modelPrompts['llama-3.1-8b-instant'];
    const effectiveMaxTokens = isPlanner
      ? researchConfig.plannerMaxTokens
      : researchConfig.researcherMaxTokens;

    // For synthesizer, the task IS the full synthesis prompt with all research results
    // Do NOT search Tavily - use the provided research directly
    if (isSynthesizer) {
      onThinking?.('synthesizing...');

      let lastError: unknown;
      for (const synthModel of synthesisCandidates) {
        const modelConfig = this.modelPrompts[synthModel] ?? this.modelPrompts['llama-3.3-70b-versatile'];
        const systemPrompt =
          `${this.getSystemPrompt(role, synthModel)}\n\n${freshnessDirective()}\n\nWrite a tight executive answer under 400 words total. Do NOT list or repeat raw findings — synthesize them. Structure: (1) a short, topic-accurate "title" (e.g. "What is Kanban?"), (2) a 2-3 sentence direct answer to the topic up top, then (3) 3-5 short thematic sections (merge overlapping findings, do NOT write one section per research task), each 2-4 sentences MAX, in your own words. Cut anything not essential to directly answering the topic. Output ONLY valid JSON with "title", "summary" (the 2-3 sentence direct answer), "sections" array [{title, content}], and "gaps": {"missing": string[], "reasoning": string}. Only name gaps genuinely missing for THIS topic — when the research already answers the topic well, set "missing" to [] so the loop can stop.`;

        onThinking?.('drafting report...');

        const response = await this.fetchRetry({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: synthModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: task }, // task = full synthesis prompt with all research
            ],
            temperature: 0.3,
            max_tokens: modelConfig.synthesizerMaxTokens,
          }),
        }, synthModel === this.researchModel ? 3 : 2);

        if (response.ok) {
          const data = await response.json();
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content.trim()) {
            return stripReasoning(content);
          }
        }
        lastError = new Error(
          response.status ? `Groq API error: received status ${response.status}${response.statusText ? ` (${response.statusText})` : ''}` : 'Groq API returned an unexpected response shape'
        );
      }
      throw lastError ?? new Error('Groq synthesis failed');
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
      `${this.getSystemPrompt(role, this.researchModel)}\n\n${freshnessDirective()}\n\nOnly make claims supported by the provided search results. If results don't cover something, state that explicitly.`;

    const response = await this.fetchRetry({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.researchModel,
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
    return stripReasoning(content);
  }

  getSystemPrompt(role: string, modelKey?: string): string {
    const modelConfig = this.modelPrompts[modelKey ?? this.model]
      ?? this.modelPrompts[modelKey ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile'];
    const configuredPrompt = modelConfig.prompts[
      role === 'agent' ? 'researcher' : role.startsWith('synthesizer') || role === 'writer' ? 'synthesizer' : role
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
