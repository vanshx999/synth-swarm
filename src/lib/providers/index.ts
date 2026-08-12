import { LLMProvider, ProviderConfig } from './types';

const DEMO_RESPONSES: Record<string, string> = {
  planner: `[
  {"id": "t1", "role": "researcher", "prompt": "Research the current state of AI startups in India 2026, funding trends, and notable companies", "dependsOn": []},
  {"id": "t2", "role": "researcher", "prompt": "Analyze AI job market trends in India 2026: roles in demand, salary ranges, skill gaps", "dependsOn": []},
  {"id": "t3", "role": "researcher", "prompt": "Investigate AI regulations and government policies in India 2026", "dependsOn": []},
  {"id": "t4", "role": "analyst", "prompt": "Synthesize startup, jobs, and regulation findings into a cohesive market overview", "dependsOn": ["t1", "t2", "t3"]},
  {"id": "t5", "role": "writer", "prompt": "Write an executive summary report from the synthesized analysis", "dependsOn": ["t4"]}
]`,
  researcher: `## Research Findings: AI Startups in India 2026

**Funding Landscape:** Total AI funding in India reached $4.2B in H1 2026, up 67% YoY. Series A/B rounds dominate (62% of deals). Key sectors: GenAI applications ($1.8B), AI infrastructure ($900M), vertical AI SaaS ($750M).

**Notable Companies:** 
- **Krutrim** (Ola): $500M valuation, building Indic LLMs
- **Sarvam AI**: $53M Series A, voice AI for Indian languages  
- **CoRover**: $10M, conversational AI for govt/enterprise
- **Gnani.ai**: $15M, voice automation for BFSI

**Trends:** Shift from foundational models to application layer. Investors prefer vertical solutions with proprietary data moats.`,

  analyst: `## Market Synthesis: India AI 2026

**Startup-Job-Regulation Triangle:**
1. **Startup boom** → talent vacuum → **salary inflation** (ML engineers ₹45-80L vs ₹25-40L in 2023)
2. **Regulatory clarity** (DPDP Act enforcement, MeitY AI guidelines) → enterprise adoption acceleration → more B2B AI budgets
3. **Language localization** as key differentiator — 22 official languages create massive moat for Indic-first companies

**Gap Identified:** Mid-market (₹10-100Cr ARR) underserved — most funding goes to seed or unicorn tier.`,

  writer: `# India AI Landscape 2026: Executive Summary

**Bottom Line:** India's AI ecosystem has crossed an inflection point — from experimentation to execution.

**Key Findings:**
- **$4.2B invested H1 2026** (67% YoY growth), concentrated in application-layer GenAI
- **Talent crisis:** 3.2x demand-supply gap for senior AI engineers; salaries up 95% in 2 years
- **Regulatory tailwind:** DPDP Act + MeitY guidelines = enterprise buying confidence
- **Localization moat:** Indic-language AI is the new defensibility frontier

**Strategic Implications:**
1. **Build for Bharat, not just India** — vernacular AI captures 600M+ underserved users
2. **Vertical > Horizontal** — domain-specific data beats generic models in enterprise sales
3. **Mid-market opportunity** — tools/platforms for ₹10-100Cr companies are wide open

**Outlook:** Next 18 months favor applied AI companies with distribution moats. Pure research plays face commoditization pressure.`
};

export class DemoProvider implements LLMProvider {
  name = 'demo';
  private delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  isAvailable() { return true; }

  async runAgent(role: string, task: string): Promise<string> {
    await this.delay(800 + Math.random() * 1200);
    const key = role.includes('plan') ? 'planner' : role;
    return DEMO_RESPONSES[key] || DEMO_RESPONSES.researcher;
  }
}

export class GroqProvider implements LLMProvider {
  name = 'groq';
  private apiKey: string;
  private baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(apiKey: string) { this.apiKey = apiKey; }

  isAvailable() { return !!this.apiKey; }

  async runAgent(role: string, task: string): Promise<string> {
    if (!this.apiKey) throw new Error('Groq API key not configured');
    
    const systemPrompt = this.getSystemPrompt(role);
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: task }
        ],
        temperature: 0.3,
        max_tokens: 4000
      })
    });
    
    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private getSystemPrompt(role: string): string {
    const prompts: Record<string, string> = {
      planner: 'You are a research planner. Decompose the user topic into 5-7 parallel research tasks. Each task needs a unique id, role (researcher/analyst/writer), prompt, and optional dependsOn array. Output ONLY valid JSON array.',
      researcher: 'You are a deep researcher. Provide specific, factual, well-structured findings with data points, names, numbers. No fluff.',
      analyst: 'You are a strategic analyst. Synthesize multiple research inputs into coherent insights. Identify patterns, gaps, implications.',
      writer: 'You are a professional report writer. Create executive-ready summaries: clear bottom line, key findings, strategic implications, outlook.'
    };
    return prompts[role] || prompts.researcher;
  }
}

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

  constructor(apiKey: string) { this.apiKey = apiKey; }

  isAvailable() { return !!this.apiKey; }

  async runAgent(role: string, task: string): Promise<string> {
    if (!this.apiKey) throw new Error('Gemini API key not configured');
    
    const systemPrompt = this.getSystemPrompt(role);
    const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${task}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 }
      })
    });
    
    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private getSystemPrompt(role: string): string {
    return GroqProvider.prototype.getSystemPrompt.call(this, role);
  }
}

export function createProviders(config: ProviderConfig): LLMProvider[] {
  const providers: LLMProvider[] = [];
  
  if (config.demoMode) providers.push(new DemoProvider());
  if (config.groq?.apiKey) providers.push(new GroqProvider(config.groq.apiKey));
  if (config.gemini?.apiKey) providers.push(new GeminiProvider(config.gemini.apiKey));
  if (providers.length === 0) providers.push(new DemoProvider());
  
  return providers;
}