/**
 * Lightweight topic classification used by the engine's dynamic planner and
 * fallback plan, so research angle selection adapts to the actual topic
 * instead of applying one fixed template to everything.
 */

export interface Angle {
  title: string;
  hint: string[];
}

export type TopicClass = 'definition' | 'entity' | 'market' | 'comparison' | 'general';

export interface TopicProfile {
  type: TopicClass;
  title: string;
  reasoning: string;
  angles: Angle[];
}

/** Collapse whitespace and strip trailing punctuation/query noise. */
export function cleanTopic(topic: string): string {
  return topic.replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '').trim();
}

/**
 * Reduce a topic to its subject by stripping any follow-up suffix added to the
 * original question (e.g. "what is pytorch — explain more" -> "what is pytorch").
 * Used so follow-up runs keep clean task titles and report titles.
 */
export function followUpBase(topic: string): string {
  const base = topic.split(/\s*(?:—|–|-)\s*/)[0].trim();
  return base || topic.trim();
}

/** Strip planner/debug noise from a task title for display (kanban, mini cards). */
export function displayTitle(title: string): string {
  return title
    .replace(/^Follow-up:\s*/i, '')
    .replace(/\s*\((?:use search results|synthesize).*?\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(topic: string): string {
  return topic
    .split(' ')
    .map((w, i) =>
      /^[a-z]/.test(w) && !/^(and|or|of|in|for|on|the|a|an|to|vs)$/i.test(w)
        ? w[0].toUpperCase() + w.slice(1)
        : w
    )
    .join(' ');
}

/** Build a topic-accurate title without repeating a "what is" prefix. */
function definitionTitle(clean: string): string {
  const m = clean.match(/^(what(?:'s|\s+is|\s+are)?|whats|how (?:does|do|to|can)|explain|define|why)\s+(.+)$/i);
  if (m) {
    const stem = m[1].replace(/\bwhats\b/i, 'What is');
    return `${stem[0].toUpperCase()}${stem.slice(1)} ${m[2]}?`;
  }
  return `What is ${clean}?`;
}

/** Pull the actual entity name out of a query wrapper like "what do you know about X". */
function entitySubject(clean: string): string {
  const m = clean.match(
    /^(?:what do you (?:know|think) about|what do you know of|tell me about|about|who (?:is|are)|what is|what are|what's)\s+(.+)$/i
  );
  return m ? m[1].trim() : clean;
}

function detectClass(topic: string): TopicClass {
  const t = topic.toLowerCase();
  // Comparison first (strongest signal, narrowest)
  if (/\b(vs\.?|versus|compare(d)?\s+(to|with)?|difference between|which is better|or better)\b/i.test(t)) {
    return 'comparison';
  }
  // People / products / organizations
  if (
    /^(what do you (know|thin[ck])|tell me about|about|who (is|are)|biograph|profile|founder|ceo)\b/i.test(t) ||
    /^[a-z-]+\s+(claude|openai|anthropic|google|microsoft|meta|tesla|github|figma|stripe)\b/i.test(t)
  ) {
    return 'entity';
  }
  // "What is X", "How does X work", "Explain X"
  if (/^(what(?:'s|\s+is|\s+are)?|whats|how (does|do|to|can)|explain|define|introduction to|guide to|overview of|is)\b/i.test(t)) {
    return 'definition';
  }
  // Markets, industries, trends, startups
  if (/(market|industry|state of|startups?|sector|landscape|funding|venture|economy|trends?|adoption|ecosystem|companies|hiring|talent|investors?)/i.test(t)) {
    return 'market';
  }
  return 'general';
}

function buildProfile(topic: string): TopicProfile {
  const clean = cleanTopic(topic);
  // Follow-ups carry a " — " suffix; classify against the subject so the
  // plan and report titles stay clean even for continuation queries.
  const base = followUpBase(clean);
  const type = detectClass(base);
  const entitySubjectName = entitySubject(base);

  const definitions: Record<TopicClass, { title: string; reasoning: string; angles: Angle[] }> = {
    definition: {
      title: definitionTitle(base),
      reasoning: `"${base}" is a definitional/educational topic, so the swarm decomposes it into the core concept, mechanism, real-world use, comparisons, and limits.`,
      angles: [
        { title: `Core definition and concept of ${base}`, hint: ['defin', 'meaning', 'concept', 'what is', 'refers to', 'basic'] },
        { title: `How ${base} works — mechanism and process`, hint: ['how', 'mechanism', 'process', 'function', 'step', 'work by', 'operate'] },
        { title: `Common use cases and real-world applications of ${base}`, hint: ['use case', 'applic', 'example', 'used for', 'real-world', 'industry'] },
        { title: `How ${base} compares to related alternatives`, hint: ['compare', 'vs', 'versus', 'alternative', 'similar', 'unlike', 'differs'] },
        { title: `Limitations, misconceptions, and edge cases of ${base}`, hint: ['limit', 'drawback', 'misconception', 'cannot', 'disadvantage', 'edge case', 'myth'] },
      ],
    },
    entity: {
      title: `${titleCase(entitySubjectName)}: An Overview`,
      reasoning: `"${base}" names an entity (person, product, or organization) — specifically "${entitySubjectName}" — so the swarm researches its origins, notable work, milestones, current standing, and how it is regarded.`,
      angles: [
        { title: `Background and origins of ${entitySubjectName}`, hint: ['background', 'origin', 'found', 'created', 'founded', 'launched', 'history', 'began'] },
        { title: `Notable work, achievements, and key facts about ${entitySubjectName}`, hint: ['notable', 'known for', 'achiev', 'key fact', 'breakthrough', 'record', 'is a'] },
        { title: `Timeline and milestones in the story of ${entitySubjectName}`, hint: ['year', 'launch', 'release', 'milestone', 'timeline', 'version', 'history'] },
        { title: `Current relevance and recent developments around ${entitySubjectName}`, hint: ['current', 'recent', 'today', 'latest', '2024', '2025', '2026', 'newest', 'active'] },
        { title: `Strengths, criticisms, and how ${entitySubjectName} is regarded`, hint: ['strength', 'critic', 'praised', 'reputation', 'flaw', 'controvers', 'limitation', 'response'] },
      ],
    },
    market: {
      title: /^state of\b/i.test(base) ? titleCase(base) : `State of ${base}`,
      reasoning: `"${base}" is an industry/market topic, so the swarm maps the landscape, key players and funding, growth drivers, barriers, and the outlook.`,
      angles: [
        { title: `Current market landscape and size of ${base}`, hint: ['market', 'size', 'valuation', 'revenue', 'billion', 'million', 'adoption', 'growing'] },
        { title: `Key players, companies, and funding in ${base}`, hint: ['startup', 'company', 'fund', 'invest', 'raise', 'capital', 'player', 'unicorn', 'backed'] },
        { title: `Growth drivers and demand factors for ${base}`, hint: ['growth', 'demand', 'driver', 'adoption', 'opportunity', 'expand', 'why'] },
        { title: `Major challenges and barriers in ${base}`, hint: ['challenge', 'barrier', 'problem', 'struggle', 'regulation', 'compliance', 'obstacle', 'risk'] },
        { title: `Policy, talent, and future outlook for ${base}`, hint: ['policy', 'regulat', 'talent', 'hire', 'job', 'workforce', 'outlook', 'forecast', 'predict', 'future'] },
      ],
    },
    comparison: {
      title: `${titleCase(base)}: A Comparison`,
      reasoning: `"${base}" is a comparison topic, so the swarm profiles both sides, contrasts them directly, weighs strengths and weaknesses, and gives a practical verdict.`,
      angles: [
        { title: `Overview of both sides in ${base}`, hint: ['overview', 'introduction', 'both side', 'is a', 'profile'] },
        { title: `Head-to-head differences for ${base}`, hint: ['difference', 'vs', 'versus', 'compare', 'faster', 'cheaper', 'better at'] },
        { title: `Strengths and weaknesses of each side in ${base}`, hint: ['strength', 'weakness', 'pro and con', 'pros', 'cons', 'advantage', 'disadvantage', 'trade-off'] },
        { title: `Which side fits which situation — practical guidance for ${base}`, hint: ['when to use', 'best for', 'recommend', 'choose', 'use case', 'fits'] },
        { title: `Verdict and bottom line for ${base}`, hint: ['verdict', 'winner', 'recommend', 'overall', 'conclusion', 'should', 'bottom line'] },
      ],
    },
    general: {
      title: titleCase(base),
      reasoning: `"${base}" doesn't fit a narrow template, so the swarm balances fundamentals, evidence, recent state, contrasting views, and pointers.`,
      angles: [
        { title: `Overview and fundamentals of ${base}`, hint: ['overview', 'fundamental', 'basic', 'introduction', 'concept', 'is a'] },
        { title: `Key facts, statistics, and evidence on ${base}`, hint: ['fact', 'data', 'statistic', 'evidence', 'report', 'figure', 'percent'] },
        { title: `Recent developments and current state of ${base}`, hint: ['recent', 'current', 'latest', '2024', '2025', '2026', 'today'] },
        { title: `Major debates and differing viewpoints on ${base}`, hint: ['debate', 'view', 'argument', 'disagree', 'critic', 'opposing', 'controvers'] },
        { title: `References and where to learn more about ${base}`, hint: ['source', 'reference', 'read more', 'further', 'document', 'report'] },
      ],
    },
  };

  const profile = definitions[type];
  return { type, title: profile.title, reasoning: profile.reasoning, angles: profile.angles };
}

/** Memoized classifier so repeated calls (planner + gap detection) agree. */
const cache = new Map<string, TopicProfile>();

export function classifyTopic(topic: string): TopicProfile {
  const clean = cleanTopic(topic);
  const cached = cache.get(clean);
  if (cached) return cached;
  const profile = buildProfile(clean);
  cache.set(clean, profile);
  return profile;
}

/** Assess which expected angles for a topic are actually covered by researched text. */
export function findCoverageGaps(topic: string, researchedText: string): { missing: string[]; reasoning: string } {
  const clean = cleanTopic(topic);
  const profile = classifyTopic(clean);
  // Only the actual research counts — never the topic string itself.
  const haystack = researchedText.toLowerCase();

  const missing: string[] = [];
  for (const angle of profile.angles) {
    const covered = angle.hint.some((hint) => haystack.includes(hint.toLowerCase()));
    if (!covered) missing.push(angle.title);
  }

  // Also require the topic's own distinctive terms to appear in the research.
  const significant = clean
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 3 && !/(what|does|know|about|state|how|why|the|and|for|with)/.test(w));
  const topicWordsMissing = significant.filter((w) => !haystack.includes(w));
  for (const w of topicWordsMissing) {
    missing.push(`Explicit coverage of "${w}" for ${clean}`);
  }

  if (missing.length === 0) {
    return {
      missing: [],
      reasoning: `Coverage of "${clean}" looks comprehensive — every angle the swarm planned for is represented in the research. No further loop needed.`,
    };
  }

  return {
    missing,
    reasoning: `For "${clean}", the swarm is still missing: ${missing
      .slice(0, 4)
      .map((m) => `"${m}"`)
      .join(', ')}. Loop again to close these gaps.`,
  };
}