import { LLMProvider, ProviderConfig } from '@/lib/types';

// ---------------------------------------------------------------------------
// Demo canned responses
// ---------------------------------------------------------------------------

const DEMO_RESPONSES: Record<string, string> = {
  planner: `{
  "reasoning": "I decomposed this into: (1) current startup landscape, (2) government policy analysis, (3) talent and education pipeline, (4) key challenges and barriers, (5) future outlook — this covers both the structural drivers and the friction points that judges look for in a comprehensive analysis.",
  "tasks": [
    {"id": "t1", "title": "Map the current Indian AI startup landscape: leading companies, venture funding totals, notable rounds, and dominant sectors in 2026."},
    {"id": "t2", "title": "Analyze India's AI government policy and regulatory environment: DPDP Act enforcement, MeitY guidelines, and the national AI mission."},
    {"id": "t3", "title": "Investigate India's AI talent and education pipeline: annual graduates, hiring demand, salary bands, skill gaps, and brain drain dynamics."},
    {"id": "t4", "title": "Synthesize findings on startup landscape, policy, and talent into strategic insights, highlighting key challenges, barriers, and cross-cutting patterns."},
    {"id": "t5", "title": "Write the final executive report covering startup landscape, policy, talent, challenges, and future outlook."}
  ]
}`,

  researcher: `## Research Findings: Indian AI Ecosystem 2026

**Startup Landscape & Funding:**
Total AI funding in India reached $4.2B in H1 2026, up 67% year-over-year. Tier-1 venture deals dominate, with 62% of all capital going to Series A/B rounds.

**Notable Companies:**
- **Krutrim (Ola)**: $500M valuation, building Indic large language models across 22 official languages.
- **Sarvam AI**: $53M Series A, focus on voice-first AI for Indian languages.
- **CoRover**: $10M, conversational AI deployed across government and enterprise touchpoints.
- **Gnani.ai**: $15M, voice automation for the BFSI (banking) sector.
- **Soket Labs**: $14M, Indic-language LLM infrastructure.

**Funding by Sector:**
- Generative AI applications: $1.8B
- AI infrastructure & MLOps: $900M
- Vertical AI SaaS: $750M
- Health-tech AI: $420M

**Trends:**
A clear shift from foundational model research to the application layer. Investors are prioritizing vertical solutions with proprietary data moats over horizontal generalization.`,


  analyst: `## Strategic Synthesis: Indian AI Ecosystem 2026

**Patterns & Trends:**
1. **Startup boom → talent vacuum:** rapid company formation has driven AI talent demand 3.2x above supply, inflating senior ML engineer compensation 95% in two years.
2. **Regulatory clarity → enterprise adoption:** DPDP Act enforcement plus MeitY advisory frameworks are converting enterprise caution into budgeted AI procurement.
3. **Localization as moat:** India's 22 official languages create a structural defensibility for Indic-first models that global players under-serve.

**Cross-cutting insight:**
The ecosystem is bifurcating between deep-research players and application-layer companies; capital flows disproportionately to the application layer.

**Reasoning / Gaps:**
This synthesis is strong on the supply side (startups, funding, regulation) but has notable **gaps** in demand-side analysis. Missing coverage of: enterprise AI adoption by industry vertical (especially manufacturing and agriculture), the SMB segment, and the export market for Indian AI services. Further research is needed on these areas to complete the picture.`,

  writer: `{
  "summary": "India's AI ecosystem crossed a definitive inflection point in 2026 — moving from experimentation to scaled execution, fueled by $4.2B in H1 funding, maturing regulation, and an expanding Indic-language moat.",
  "sections": [
    {
      "title": "Startup Landscape",
      "content": "AI funding reached $4.2B in H1 2026 (up 67% YoY), concentrated in application-layer GenAI. Notable players include Krutrim, Sarvam AI, CoRover, and Gnani.ai building Indic-language and vertical AI solutions."
    },
    {
      "title": "Policy & Regulation",
      "content": "DPDP Act enforcement and MeitY AI guidelines have provided enterprise buying confidence, accelerating B2B AI adoption."
    },
    {
      "title": "Talent & Education",
      "content": "A 3.2x demand-supply gap for senior AI engineers persists, with salaries rising 95% in two years, pressuring both startups and incumbents."
    },
    {
      "title": "Challenges & Barriers",
      "content": "Key barriers include compute cost, data availability for Indic languages, and a talent crunch at senior levels."
    },
    {
      "title": "Future Outlook",
      "content": "The next 18 months favor applied AI companies with distribution moats and Indic-language focus; pure research plays face commoditization pressure."
    }
  ],
  "gaps": {
    "missing": ["demand-side enterprise adoption by vertical", "SMB AI adoption", "export market for Indian AI services"],
    "reasoning": "Note: this report lacks coverage of the demand side — specifically enterprise adoption within manufacturing and agriculture, SMB uptake, and the export funnel for Indian AI services. Further research needed on these areas before the analysis is complete."
  }
}`,
};


// ---------------------------------------------------------------------------
// DemoProvider
// ---------------------------------------------------------------------------

export class DemoProvider implements LLMProvider {
  name = 'demo';

  private delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  isAvailable(): boolean {
    return true;
  }

  async runAgent(role: string, _task: string): Promise<string> {
    // Small artificial delay (500-1500ms)
    const delayMs = 500 + Math.random() * 1000;
    await this.delay(delayMs);

    const key = role.includes('plan') ? 'planner' : role;
    if (key === 'synthesizer' || key === 'writer') {
      return DEMO_RESPONSES.writer;
    }
    return DEMO_RESPONSES[key] || DEMO_RESPONSES.researcher;
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

  async runAgent(role: string, task: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error('Groq API key not configured');
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: this.getSystemPrompt(role) },
          { role: 'user', content: task },
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
        'You are a research planner. Decompose into 5-7 tasks. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
      researcher:
        'You are a deep researcher. Provide specific factual findings with data.',
      analyst:
        'You are a strategic analyst. Synthesize findings, identify patterns.',
      synthesizer:
        'You are an executive report writer. Create a comprehensive report as JSON with "summary", "sections" array [{title, content}], and ALSO identify any "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      writer:
        'You are an executive report writer. Create a comprehensive report as JSON with "summary", "sections" array [{title, content}], and ALSO identify any "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
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

