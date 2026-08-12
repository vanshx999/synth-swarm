import { LLMProvider, ProviderConfig, Source } from '@/lib/types';

// ---------------------------------------------------------------------------
// Tavily Search
// ---------------------------------------------------------------------------

async function searchTavily(query: string): Promise<Source[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, api_key: apiKey, search_depth: 'basic', max_results: 5 }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sourcesToContext(sources: Source[]): string {
  return sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`,
    )
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// DemoProvider
// ---------------------------------------------------------------------------

export class DemoProvider implements LLMProvider {
  name = 'demo';

  isAvailable(): boolean {
    return true;
  }

  async runAgent(
    role: string,
    task: string,
    onThinking?: (s: string) => void,
    onSources?: (sources: Source[]) => void
  ): Promise<string> {
    const isPlanner = role.includes('plan');
    const isSynthesizer = role === 'synthesizer' || role === 'writer';

    // For synthesizer, the task IS the full synthesis prompt with all research results
    // Do NOT search Tavily - use the provided research directly
    if (isSynthesizer) {
      onThinking?.('synthesizing...');
      const ms = 1500 + Math.random() * 1000;
      await new Promise<void>((r) => setTimeout(r, ms));
      onThinking?.('drafting report...');
      return this.synthesize(task); // task = full synthesis prompt with all research
    }

    // For planner and researcher: do Tavily search
    // Clean the search query — strip parenthetical hints, "Follow-up:" prefix
    let searchQuery = task
      .replace(/\s*\(.*?\)\s*/g, ' ')  // remove (use search results...) / (synthesize...)
      .replace(/^Follow-up:\s*/i, '')  // remove "Follow-up: " prefix for gap tasks
      .trim();
    if (isPlanner) {
      const topicMatch = task.match(/"([^"]+)"/);
      if (topicMatch) searchQuery = topicMatch[1];
    }

    onThinking?.('searching...');

    const sources = await searchTavily(searchQuery);
    onSources?.(sources);

    onThinking?.(`found ${sources.length} results`);

    const ms = 1000 + Math.random() * 1000;
    await new Promise<void>((r) => setTimeout(r, ms));

    if (isPlanner) {
      return this.planFromSearch(task, sources);
    }

    if (sources.length > 0) {
      return this.buildResearchSummary(sources);
    }

    return 'Limited search results found for this query.';
  }

  private buildResearchSummary(sources: Source[]): string {
    const lines: string[] = ['## Research Findings\n'];
    for (const s of sources) {
      lines.push(`### ${s.title}`);
      lines.push(`${s.snippet}`);
      lines.push(`— [${s.url}](${s.url})`);
      lines.push('');
    }
    return lines.join('\n');
  }

  private planFromSearch(task: string, sources: Source[]): string {
    // Extract the real topic from the planner prompt (which includes instructions)
    const topicMatch = task.match(/"([^"]+)"/);
    const topic = topicMatch ? topicMatch[1] : task.replace(/^You are a research planner.*?topic(\s|")/i, '').replace(/".*/, '').trim() || task;
    const angles = [
      `Current state and key players in ${topic}`,
      `Policy and regulatory environment for ${topic}`,
      `Talent, research, and innovation pipeline for ${topic}`,
      `Major challenges and barriers in ${topic}`,
      `Future outlook and predictions for ${topic}`,
    ];
    const suffix = sources.length > 0 ? ' (use search results as primary source)' : ' (synthesize from general knowledge)';
    const tasks: { id: string; title: string }[] = [];
    for (let i = 0; i < angles.length; i++) {
      tasks.push({ id: `t${i + 1}`, title: `${angles[i]}${suffix}` });
    }
    const plan = {
      reasoning: `Decomposed "${topic}" into 5 research angles covering landscape, policy, talent, challenges, and outlook.`,
      tasks,
    };
    return JSON.stringify(plan);
  }

  private synthesize(prompt: string): string {
    // The prompt contains all the research results from all tasks
    // Parse the task results from the prompt and create a structured report
    const taskResults = this.extractTaskResults(prompt);

    if (taskResults.length === 0) {
      return JSON.stringify({
        summary: 'No research results available to synthesize.',
        sections: [],
        gaps: {
          missing: ['All research areas'],
          reasoning: 'No completed task results were provided for synthesis.',
        },
      });
    }

    // Condensed executive answer — not a per-task dump.
    // Keep 3-5 short thematic sections, each trimmed to a couple sentences.
    const topics = taskResults.map((tr) => this.cleanTitle(tr.title));
    const directAnswer = this.directAnswer(taskResults);

    const sections = taskResults.slice(0, 4).map((tr) => ({
      title: this.cleanTitle(tr.title),
      content: this.condense(tr.result),
    }));

    // Detect potential gaps from the task titles
    const coveredTopics = topics.join(' ').toLowerCase();
    const commonGaps = [
      'implementation details',
      'cost analysis',
      'security considerations',
      'scalability patterns',
      'real-world case studies',
    ];
    const missing = commonGaps
      .filter((gap) => !coveredTopics.includes(gap))
      .slice(0, 3);

    return JSON.stringify({
      summary: directAnswer,
      sections,
      gaps: {
        missing,
        reasoning: missing.length > 0
          ? `Potential areas for deeper exploration: ${missing.join(', ')}.`
          : 'Coverage appears comprehensive across all research angles.',
      },
    });
  }

  /** A 1-2 sentence direct answer drawn from the first findings. */
  private directAnswer(results: { title: string; result: string }[]): string {
    const first = results[0]?.result || '';
    const lines = first
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 20);
    const lead = (lines[0] || 'Findings synthesized from the swarm.').slice(0, 220);
    return `${lead}${lead.endsWith('.') ? '' : '.'} (Condensed from ${results.length} research areas.)`;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/^Follow-up:\s*/i, '')
      .replace(/\s*\(use search results.*?\)\s*/gi, '')
      .replace(/\s*\(synthesize.*?\)\s*/gi, '')
      .trim();
  }

  private condense(content: string): string {
    const text = content
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 220);
  }

  private extractTaskResults(prompt: string): { title: string; result: string }[] {
    const results: { title: string; result: string }[] = [];
    const sections = prompt.split('\n\n---\n\n');
    
    for (const section of sections) {
      const titleMatch = section.match(/^##\s+(.+)$/m);
      const contentMatch = section.match(/^##\s+.+?\n([\s\S]+)/);
      
      if (titleMatch && contentMatch) {
        results.push({
          title: titleMatch[1].trim(),
          result: contentMatch[1].trim(),
        });
      }
    }
    
    return results;
  }
}

// ---------------------------------------------------------------------------
// GroqProvider
// ---------------------------------------------------------------------------

export class GroqProvider implements LLMProvider {
  name = 'groq';

  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
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

    // For synthesizer, the task IS the full synthesis prompt with all research results
    // Do NOT search Tavily - use the provided research directly
    if (isSynthesizer) {
      onThinking?.('synthesizing...');

      const systemPrompt =
        `${this.getSystemPrompt(role)}\n\nWrite a tight executive answer under 400 words total. Do NOT list or repeat raw findings — synthesize them. Structure: (1) a 2-3 sentence direct answer to the topic up top, then (2) 3-5 short thematic sections (merge overlapping findings, do NOT write one section per research task), each 2-4 sentences MAX, in your own words. Cut anything not essential to directly answering the topic. Output ONLY valid JSON with "summary" (the 2-3 sentence direct answer), "sections" array [{title, content}], and "gaps": {"missing": string[], "reasoning": string}.`;

      onThinking?.('drafting report...');

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: task }, // task = full synthesis prompt with all research
          ],
          temperature: 0.3,
          max_tokens: 900,
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

    const sources = await searchTavily(searchQuery);
    onSources?.(sources);

    onThinking?.(`found ${sources.length} results`);

    onThinking?.('drafting...');

    const searchContext =
      sources.length > 0
        ? `Search results for context:\n${sourcesToContext(sources)}`
        : 'No search results were found for this query.';

    const systemPrompt =
      `${this.getSystemPrompt(role)}\n\nOnly make claims supported by the provided search results. If results don't cover something, state that explicitly.`;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${searchContext}\n\nTask: ${task}` },
        ],
        temperature: 0.3,
        max_tokens: 4096,
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

  private getSystemPrompt(role: string): string {
    const prompts: Record<string, string> = {
      planner:
        'You are a world-class research director. Decompose the topic into 5-7 distinct research angles that together provide complete coverage. Each task must have a clear, specific research question as the title. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
      researcher:
        'You are an expert research analyst. Provide a detailed, well-structured research brief with specific facts, figures, names, dates, and data points. Be comprehensive — aim for 3-5 paragraphs with concrete evidence. Cite specific companies, people, events, statistics where relevant. Do NOT give generic advice — give specific, cited findings. Cite the search result sources in your response.',
      analyst:
        'You are a strategic analyst. Synthesize findings across multiple research sources, identify cross-cutting patterns, and surface non-obvious connections. Ground all claims in provided search results.',
      synthesizer:
        'You are an executive research director. Synthesize ALL provided research into a comprehensive report. After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, not generic categories. Create a JSON object with "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      writer:
        'You are an executive research director. Synthesize ALL provided research into a comprehensive report. After synthesizing, critically evaluate if any important angles were missed — but only name gaps SPECIFIC to this topic, not generic categories. Create a JSON object with "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
    };
    return prompts[role] || prompts.researcher;
  }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function getProvider(config: ProviderConfig): LLMProvider {
  if (config.provider === 'groq' && config.groqApiKey) {
    return new GroqProvider(config.groqApiKey);
  }
  return new DemoProvider();
}
