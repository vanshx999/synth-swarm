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

  researcher_startup: `## Research Findings: India AI Startup Landscape 2026

**Funding Overview:**
Total AI funding in India reached $4.2B in H1 2026, up 67% year-over-year. Tier-1 venture deals dominate, with 62% of all capital going to Series A/B rounds. Peak XV, Accel, and Lightspeed lead the investment tables with a combined $1.3B deployed across 48 AI deals.

**Notable Companies:**
- **Krutrim (Ola)**: $500M valuation, building Indic large language models across 22 official languages. Raised $50M Series B led by Tiger Global in March 2026.
- **Sarvam AI**: $53M Series A (December 2025), voice-first AI for Indian languages. Backed by Peak XV and Lightspeed.
- **CoRover**: $10M, conversational AI deployed across 15+ government ministries and major enterprises including IRCTC.
- **Gnani.ai**: $15M Series A, voice automation for BFSI with clients including HDFC Bank and SBI Life.
- **Soket Labs**: $14M seed, Indic-language LLM infrastructure. Open-source model PraLekha reaches 1M+ HuggingFace downloads.

**Sector Breakdown:**
- Generative AI applications: $1.8B (43% of total)
- AI infrastructure & MLOps: $900M (21%)
- Vertical AI SaaS: $750M (18%)
- Health-tech AI: $420M (10%)
- Agri-tech AI: $330M (8%)

**Key Trend:**
A clear shift from foundational model research to the application layer. Investors prioritize vertical solutions with proprietary data moats over horizontal generalization. B2B SaaS AI companies command 8-12x ARR multiples vs 5-7x for pure-play research firms.`,

  researcher_policy: `## Research Findings: India AI Policy & Regulation 2026

**DPDP Act Enforcement:**
The Digital Personal Data Protection Act entered full enforcement in Q4 2025. By mid-2026, the Data Protection Board of India had issued 14 compliance orders, penalizing two major fintech AI platforms Rs 25 crore each for unauthorized training data usage. Consent managers (registered under MeitY) now form a $120M compliance-tooling market.

**National AI Mission (IndiaAI):**
Budget allocation for 2026-27 stands at Rs 2,500 crore ($300M), up from Rs 1,038 crore in 2024. Key pillars: (a) IndiaAI Compute — 18,693 GPUs deployed across 10 academic clusters; (b) IndiaAI Datasets Platform — 140+ curated Indic-language datasets live; (c) IndiaAI FutureSkills — 50,000 students enrolled in tier-2/3 city AI fellowships.

**MeitY AI Advisory (March 2026):**
Requires significant AI models to obtain government permission before public deployment. Platforms must label AI-generated content and disclose training data provenance. Six major platforms (including Krutrim and Sarvam) have registered under the advisory framework as of July 2026.

**Sector-Specific Regulation:**
- RBI's AI in Finance guidelines (January 2026) mandate human-in-the-loop for credit decisions above Rs 10 lakh
- IRDAI's AI sandbox approved 7 insurance AI use cases in 2026
- NITI Aayog's Responsible AI framework adopted by 23 state governments for e-governance AI procurement

**International Context:**
India has emerged as a leader in Global South AI governance, co-chairing the GPAI summit 2026 in New Delhi alongside France, advocating for differentiated compliance timelines for developing nations.`,

  researcher_talent: `## Research Findings: India AI Talent & Education Pipeline 2026

**Supply-Side Numbers:**
India produced approximately 1.5 million engineering graduates in 2025, of whom an estimated 120,000 had AI/ML coursework. Top 50 NIRF-ranked engineering institutes contribute ~15,000 AI-specialized graduates annually. IIT Madras's online BS in Data Science enrolled 35,000 students in 2026, its largest cohort yet.

**Demand & Compensation:**
- Active AI/ML job postings on Naukri.com: 68,000 (up 45% YoY)
- Average salary for ML Engineer (3-5 years experience): Rs 28-45 LPA, up 95% from 2024
- Senior/Staff ML Engineer (8+ years): Rs 80 LPA - 1.5 Cr, now competitive with Bay Area adjusted for PPP
- Demand-supply ratio: 3.2 open roles per qualified candidate for senior positions

**Brain Drain Dynamics:**
An estimated 25,000 Indian AI researchers work abroad (US, UK, Canada, UAE). Reverse migration has accelerated: 1,800 senior AI professionals returned to India in 2025-26, driven by GCC (Global Capability Center) expansion by Google, Microsoft, and Amazon in Bengaluru-Hyderabad corridor.

**Skill Gaps:**
- MLOps & productionization: top-cited gap by 72% of hiring managers
- Indic NLP specialization: only 400-500 professionals with deep expertise across 22 languages
- AI safety/alignment: <200 professionals with formal training in India

**Education Initiatives:**
- IndiaAI FutureSkills: 50,000 fellowships for tier-2/3 cities, operational in 200 districts
- Private sector: UpGrad, Scaler, and Great Learning have cumulatively trained 300,000 professionals in AI/ML since 2023
- IIT Delhi's new School of AI (2026): admits 100 PhD + 300 MTech students annually`,

  researcher_gap_enterprise: `## Research Findings: Enterprise AI Adoption by Industry Vertical

**Manufacturing Sector:**
Tata Steel deployed computer vision AI across 4 plants in 2025, reducing defect rates by 32%. The total addressable market for AI-driven predictive maintenance in Indian manufacturing is estimated at $2.8B by NASSCOM's 2026 Enterprise AI report. Larsen & Toubro's AI division (L&T-Nxt) has 1,200 engineers building digital twins for infrastructure projects. However, SME manufacturers (95% of the sector) show <8% AI adoption rate due to capital constraints and fragmented data systems.

**Agriculture & Agri-tech:**
- AI-driven crop advisory platforms (CropIn, DeHaat, AgNext) now cover 12 million farmers
- India Digital Ecosystem of Agriculture (IDEA) launched nationwide in January 2026, providing AI-based soil health cards and pest prediction to 50 million farmers
- Microsoft's AI for Agriculture initiative deployed 100,000 IoT sensor nodes in Maharashtra and Punjab for micro-climate monitoring
- Key barrier: only 35% of Indian farms have reliable internet connectivity for real-time AI tools; edge-AI approaches gaining traction`,

  researcher_gap_smb: `## Research Findings: SMB AI Adoption in India

**Adoption Landscape:**
India's 64 million MSMEs represent 30% of GDP but <5% use any AI tool beyond basic accounting automation. Zoho and Tally (domestic SaaS leaders) report 1.2 million SMBs using their AI-powered features (invoice OCR, cash flow prediction) in 2026, up from 400,000 in 2024.

**Key Barriers:**
1. Cost sensitivity: 78% of surveyed SMBs cite upfront cost as primary barrier (median willingness-to-pay: Rs 2,000/month)
2. Digital literacy: 62% of SMB owners in tier-3 cities lack confidence in evaluating AI vendors
3. Data readiness: 70% still maintain records on paper or unstructured Excel files

**Government Interventions:**
- Open Network for Digital Commerce (ONDC) integrated AI cataloging for 350,000 SMB sellers
- SIDBI's AI Adoption Fund: Rs 500 crore allocated for SMB AI loans at 6% interest
- MSME Ministry's Digital Saksham program trained 200,000 entrepreneurs in AI basics in 2025-26`,

  researcher_gap_export: `## Research Findings: Export Market for Indian AI Services

**Current Export Volume:**
India's AI services exports reached $8.3B in FY2025-26, up from $5.1B in FY2024 (63% growth). IT services majors (TCS, Infosys, Wipro, HCL) contribute ~65% of this through AI transformation deals. Pure-play AI firms (Fractal, Mu Sigma, Arya.ai) contribute the remaining 35%.

**Key Export Markets:**
- United States: 48% ($4.0B) — enterprise AI integration, model fine-tuning, MLOps
- UK/Europe: 22% ($1.8B) — compliance-focused AI, responsible AI consulting
- APAC (non-India): 15% ($1.2B) — banking AI, fraud detection
- Middle East: 10% ($830M) — smart city AI, government digitization
- Africa/LatAm: 5% ($415M) — agri-tech, financial inclusion AI

**Competitive Advantage:**
- Cost arbitrage: Indian AI engineers at 40-60% of US equivalent salaries
- GCC ecosystem: 1,600+ Global Capability Centers operating AI/ML teams
- Language advantage: Indian firms lead in multilingual AI deployment for Global South markets

**Challenges:**
- US immigration uncertainty around H-1B for AI roles
- EU AI Act compliance costs for Indian exporters ($50-200K per medium deployment)
- Competition from Philippines and Eastern Europe in cost-competitive AI services`,

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

  writer_nogaps: `{
  "summary": "India's AI ecosystem crossed a definitive inflection point in 2026 — moving from experimentation to scaled execution, fueled by $4.2B in H1 funding, maturing regulation, and an expanding Indic-language moat. Comprehensive follow-up research confirms the picture is now complete across supply and demand dimensions.",
  "sections": [
    {
      "title": "Startup Landscape",
      "content": "AI funding reached $4.2B in H1 2026 (up 67% YoY), concentrated in application-layer GenAI. Notable players include Krutrim, Sarvam AI, CoRover, and Gnani.ai building Indic-language and vertical AI solutions."
    },
    {
      "title": "Policy & Regulation",
      "content": "DPDP Act enforcement and MeitY AI guidelines have provided enterprise buying confidence, accelerating B2B AI adoption. National AI Mission budget doubled to Rs 2,500 crore."
    },
    {
      "title": "Talent & Education",
      "content": "A 3.2x demand-supply gap for senior AI engineers persists, with salaries rising 95% in two years, pressuring both startups and incumbents. 50,000 fellowships deployed across 200 districts."
    },
    {
      "title": "Enterprise Adoption",
      "content": "Tata Steel reduced defect rates 32% via computer vision; L&T-Nxt deployed 1,200 engineers on digital twins. SME manufacturers show <8% AI adoption — a $2.8B untapped market."
    },
    {
      "title": "SMB AI Uptake",
      "content": "Only 5% of India's 64M MSMEs use AI beyond basic accounting. Zoho and Tally lead the SMB SaaS push with 1.2M AI-enabled users. SIDBI's Rs 500 Cr AI Adoption Fund aims to bridge the gap."
    },
    {
      "title": "Export Markets",
      "content": "Indian AI services exports hit $8.3B in FY2026 (up 63%). TCS, Infosys, Wipro lead with 65% share. US remains the largest market (48%), followed by Europe (22%) and Middle East (10%)."
    }
  ],
  "gaps": {
    "missing": [],
    "reasoning": "Complete. All identified gaps have been addressed through targeted follow-up research."
  }
}`,
};


// ---------------------------------------------------------------------------
// DemoProvider
// ---------------------------------------------------------------------------

export class DemoProvider implements LLMProvider {
  name = 'demo';

  private delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  private synthesizerCallCount = 0;

  isAvailable(): boolean {
    return true;
  }

  async runAgent(role: string, task: string): Promise<string> {
    const delayMs = 500 + Math.random() * 1000;
    await this.delay(delayMs);

    const key = role.includes('plan') ? 'planner' : role;

    if (key === 'synthesizer' || key === 'writer') {
      this.synthesizerCallCount++;
      if (this.synthesizerCallCount === 1) {
        return DEMO_RESPONSES.writer;
      }
      return DEMO_RESPONSES.writer_nogaps;
    }

    return this.pickResearcherResponse(task);
  }

  private pickResearcherResponse(task: string): string {
    const t = task.toLowerCase();

    if (t.includes('follow-up')) {
      if (t.includes('enterprise') || t.includes('manufacturing') || t.includes('adoption') || t.includes('vertical')) {
        return DEMO_RESPONSES.researcher_gap_enterprise;
      }
      if (t.includes('smb') || t.includes('msme')) {
        return DEMO_RESPONSES.researcher_gap_smb;
      }
      if (t.includes('export')) {
        return DEMO_RESPONSES.researcher_gap_export;
      }
      return DEMO_RESPONSES.researcher_gap_enterprise;
    }

    if (t.includes('policy') || t.includes('regulation') || t.includes('regulatory') || t.includes('dpdp') || t.includes('meity') || t.includes('government')) {
      return DEMO_RESPONSES.researcher_policy;
    }

    if (t.includes('talent') || t.includes('education') || t.includes('skill') || t.includes('hiring') || t.includes('graduate')) {
      return DEMO_RESPONSES.researcher_talent;
    }

    if (t.includes('startup') || t.includes('funding') || t.includes('venture') || t.includes('company') || t.includes('companies')) {
      return DEMO_RESPONSES.researcher_startup;
    }

    return DEMO_RESPONSES.researcher_startup;
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
        'You are a world-class research director. Decompose the topic into 5-7 distinct research angles that together provide complete coverage. Each task must have a clear, specific research question as the title. Return valid JSON with "tasks" array and "reasoning" string. Each task: {id, title, status:"pending"}. Output ONLY the JSON object, no markdown.',
      researcher:
        'You are an expert research analyst. Provide a detailed, well-structured research brief with specific facts, figures, names, dates, and data points. Be comprehensive — aim for 3-5 paragraphs with concrete evidence. Cite specific companies, people, events, statistics where relevant. Do NOT give generic advice — give specific, cited findings.',
      analyst:
        'You are a strategic analyst. Synthesize findings across multiple research sources, identify cross-cutting patterns, and surface non-obvious connections.',
      synthesizer:
        'You are an executive research director. Synthesize ALL provided research into a comprehensive report. After synthesizing, critically evaluate if any important angles were missed. If coverage is complete, set gaps.missing to empty array. Create a JSON object with "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
      writer:
        'You are an executive research director. Synthesize ALL provided research into a comprehensive report. After synthesizing, critically evaluate if any important angles were missed. If coverage is complete, set gaps.missing to empty array. Create a JSON object with "summary", "sections" array [{title, content}], and "gaps": { "missing": string[], "reasoning": string }. Output ONLY valid JSON.',
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

