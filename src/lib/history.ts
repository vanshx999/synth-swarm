import type { SwarmEvent, Report } from '@/lib/types';

export interface ChatHistoryEntry {
  id: string;
  topic: string;
  provider: 'demo' | 'groq';
  createdAt: number;
  events: SwarmEvent[];
  report: Report | null;
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
    const parsed = JSON.parse(raw) as ChatHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRun(entry: ChatHistoryEntry): void {
  const history = getHistory();
  history.unshift(entry);
  const trimmed = history.slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // history may exceed quota — drop oldest batch and retry once
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
    } catch {
      // storage unavailable — ignore
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