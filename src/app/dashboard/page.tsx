'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { SwarmEvent } from '@/lib/types';
import { getSession, getHistory, saveRun, logout, deleteRun, type ChatHistoryEntry } from '@/lib/history';
import type { RunModel } from '@/lib/runModel';
import { applyEvent, emptyRun } from '@/lib/runModel';
import { ChatView } from '@/components/ChatView';
import { KanbanView } from '@/components/KanbanView';
import ThemeToggle from '@/components/ThemeToggle';

type ViewMode = 'chat' | 'kanban';

export default function DashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ViewMode>('chat');
  const [provider, setProvider] = useState<'demo' | 'groq'>('demo');
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const [activeRun, setActiveRun] = useState<RunModel | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
    setHistory(getHistory());
  }, [router]);

  const handleSaveRun = useCallback((run: RunModel, topic: string, events: SwarmEvent[]) => {
    const entry: ChatHistoryEntry = {
      id: run.startedAt ? `run-${run.startedAt}` : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic,
      provider,
      createdAt: run.startedAt || Date.now(),
      events,
      report: run.report,
      error: run.error,
    };
    setHistory((prev) => {
      const next = [entry, ...prev.filter((h) => h.id !== entry.id)].slice(0, 30);
      return next;
    });
    saveRun(entry);
    setSelectedId(entry.id);
  }, [provider]);

  const handleActiveRunChange = useCallback((run: RunModel | null) => {
    setActiveRun(run);
    if (run) setSelectedId(null);
  }, []);

  const loadRun = (entry: ChatHistoryEntry) => {
    setSelectedId(entry.id);
    setMode('chat');
    setActiveRun(null);
    // Rebuild a run model from saved events so kanban can show the finished board
    let m: RunModel = {
      ...emptyRun(),
      topic: entry.topic,
      report: entry.report,
      error: entry.error,
      startedAt: entry.createdAt,
    };
    for (const evt of entry.events) {
      m = applyEvent(m, evt, entry.createdAt);
    }
    setActiveRun(m);
  };

  const confirmLogout = () => {
    logout();
    router.replace('/login');
  };

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 animate-ping" />
      </div>
    );
  }

  const session = getSession();
  const selected = history.find((h) => h.id === selectedId) ?? null;

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Backdrop handled by layout */}

      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 dark:bg-black/60 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 w-72 shrink-0 glass border-r border-black/8 dark:border-white/10 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-black/5 dark:border-white/10">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 via-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold shadow-brand-glow">
            S
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold tracking-tight leading-none">Synth</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted mt-1">
              swarm research
            </div>
          </div>
          <button
            onClick={confirmLogout}
            className="text-muted hover:text-rose-500 transition-colors">
            {/* logout icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="px-4 pt-4">
          <button
            onClick={() => {
              setSelectedId(null);
              setActiveRun(null);
              setMode('chat');
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 text-white py-2.5 px-3 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-brand-glow"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New research
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto custom-scroll px-3 py-4 space-y-1.5">
          <div className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.25em] text-muted">
            Recent swarms
          </div>
          {history.length === 0 && (
            <div className="px-2 text-xs text-muted leading-relaxed">
              No runs yet. Ask the swarm something!
            </div>
          )}
          {history.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                loadRun(h);
                setSidebarOpen(false);
              }}
              className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all duration-200 group ${
                selectedId === h.id
                  ? 'bg-surface border-violet-200 shadow-[0_0_0_1px_rgba(139,92,246,0.2)]'
                  : 'bg-surface/50 border-black/5 dark:border-white/10 hover:bg-surface hover:border-violet-200/60 hover:shadow-soft'
              }`}
            >
              <div className="text-[13px] font-medium truncate text-ink">{h.topic}</div>
              <div className="text-[11px] text-muted truncate mt-0.5">
                {h.report?.summary?.slice(0, 140) ||
                  (h.error ? `Error: ${h.error}` : 'Run in history')}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-[9px] text-muted">
                  {new Date(h.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-mono text-[9px] uppercase px-1 rounded bg-surface/60 border border-black/5 dark:border-white/10 text-muted">
                    {h.provider}
                  </span>
                  {h.report ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="report ready" />
                  ) : h.error ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* User */}
        <div className="px-4 py-4 border-t border-black/5 dark:border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400 to-fuchsia-500 flex items-center justify-center text-white font-bold text-sm">
            {(session?.name || 'B')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{session?.name || 'Builder'}</div>
            <div className="text-[11px] text-muted truncate">{session?.email}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-4 lg:px-6 py-3 border-b border-black/5 dark:border-white/10 bg-surface/40 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 text-muted hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Mode toggle: Chat | Kanban */}
          <div className="flex items-center gap-1 rounded-full bg-black/5 dark:bg-white/10 p-1">
            <button
              onClick={() => setMode('chat')}
              className={`font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${
                mode === 'chat'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setMode('kanban')}
              className={`font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${
                mode === 'kanban'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              🗂 Kanban
            </button>
          </div>

          {/* Provider toggle */}
          <div className="ml-auto flex items-center gap-1.5">
            {(['demo', 'groq'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                title={p === 'demo' ? 'Instant demo (no API key)' : 'Live Groq agents'}
                className={`font-mono text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border transition-all ${
                  provider === p
                    ? p === 'groq'
                      ? 'bg-violet-500 text-white border-violet-500'
                      : 'bg-cyan-500 text-white border-cyan-500'
                    : 'bg-surface/60 text-muted border-black/10 dark:border-white/10 hover:text-ink'
                }`}
              >
                {p === 'groq' ? '⚡ Groq' : '◈ Demo'}
              </button>
            ))}
            <ThemeToggle />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {mode === 'chat' ? (
            <ChatView
              provider={provider}
              loadedRun={selected ? activeRun : null}
              loadedKey={selectedId ?? undefined}
              onSaveRun={handleSaveRun}
              onActiveRunChange={handleActiveRunChange}
            />
          ) : (
            <KanbanView run={activeRun} />
          )}
        </div>
      </main>
    </div>
  );
}
