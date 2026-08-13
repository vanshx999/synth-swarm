import type { SwarmEvent, Report } from '@/lib/types';
import { cleanTopic } from '@/lib/topic';

export interface ChatHistoryEntry {
  id: string;
  topic: string;
  provider: 'groq';
  createdAt: number;
  events: SwarmEvent[];
  report: Report | null;
  questions: string[];
  questionCount: number;
  mergeIfSameTopic(newTopic: string): boolean;
  error?: string;
}

const HISTORY_KEY = 'synth_history';
const SESSION_KEY = 'synth_session';
const MAX_ENTRIES = 30;

export function getHistory(): ChatHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ChatHistoryEntry>[];
    return Array.isArray(parsed) ? parsed.map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

function normalizeEntry(entry: Partial<ChatHistoryEntry>): ChatHistoryEntry {
  const topic = typeof entry.topic === 'string' ? entry.topic : '';
  const questions = Array.isArray(entry.questions) && entry.questions.length > 0
    ? entry.questions.filter((q): q is string => typeof q === 'string')
    : [topic];
  const questionCount = typeof entry.questionCount === 'number'
    ? entry.questionCount
    : questions.length;

  return {
    ...(entry as ChatHistoryEntry),
    topic,
    questions,
    questionCount: Math.max(questionCount, questions.length),
    mergeIfSameTopic(newTopic: string) { return topicsShareWords(topic, newTopic); },
  };
}

export function topicsShareWords(topic: string, newTopic: string): boolean {
  const existingWords = new Set(cleanTopic(topic).toLowerCase().split(/\s+/).filter(Boolean));
  const newWords = new Set(cleanTopic(newTopic).toLowerCase().split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const word of newWords) {
    if (existingWords.has(word)) overlap += 1;
  }
  return overlap >= 2;
}

/**
 * Slim down run events before they touch localStorage. Raw task results and
 * source snippets are the bulk of the payload; the retained fields are enough
 * to rebuild the kanban board and resources list after a reload while a full
 * run stays around 6-10KB instead of 60-80KB.
 */
export function trimEventsForStorage(events: SwarmEvent[]): SwarmEvent[] {
  return events.map((e) => {
    if (e.type === 'task_update') {
      const t = e.task;
      return {
        ...e,
        task: {
          id: t.id,
          title: t.title,
          status: t.status,
          error: t.error,
          result: typeof t.result === 'string' ? t.result.slice(0, 400) : undefined,
          sources: Array.isArray(t.sources)
            ? t.sources.map((s) => ({
                title: s.title,
                url: s.url,
                snippet: (s.snippet || '').slice(0, 160),
              }))
            : undefined,
        },
      };
    }
    return e;
  });
}

export function saveRun(entry: ChatHistoryEntry): void {
  const stored: ChatHistoryEntry = { ...entry, events: trimEventsForStorage(entry.events) };
  const history = [stored, ...getHistory().filter((h) => h.id !== stored.id)].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Quota hit — retry with a much smaller window so the newest run survives.
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch {
      // Last resort: keep metadata + report only (drop event streams entirely).
      try {
        const minimal = history.slice(0, 20).map((h) => ({ ...h, events: [] }));
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(minimal));
      } catch {
        // storage unavailable entirely — ignore
      }
    }
  }
}

export function deleteRun(id: string): ChatHistoryEntry[] {
  const next = getHistory().filter((h) => h.id !== id);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------- demo auth (client-only) ---------------- */

const FAKE_USER = { name: 'Builder', email: 'builder@synth.dev' };

export interface SessionUser {
  name: string;
  email: string;
  loggedInAt: number;
}

export function getSession(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function login(email: string, name?: string): SessionUser {
  const user: SessionUser = {
    name: name?.trim() || email.split('@')[0] || FAKE_USER.name,
    email,
    loggedInAt: Date.now(),
  };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  return user;
}

export function logout(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
