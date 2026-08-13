'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { SearchProvider, SwarmEvent } from '@/lib/types';
import { getSession, getHistory, saveRun, saveRunAll, logout, trimEventsForStorage, topicsShareWords, type ChatHistoryEntry } from '@/lib/history';
import type { RunModel } from '@/lib/runModel';
import { applyEvent, emptyRun } from '@/lib/runModel';
import { ChatView } from '@/components/ChatView';
import { KanbanView } from '@/components/KanbanView';
import { ResourcesView } from '@/components/ResourcesView';
import ThemeToggle from '@/components/ThemeToggle';

type ViewMode = 'chat' | 'kanban' | 'resources';

export default function DashboardPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [mode, setMode] = useState<ViewMode>('chat');
  const [history, setHistory] = useState<ChatHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Bumped to give the composer a fresh identity after a run finalizes, so the
  // next question starts in a clean box instead of stacking on the old report.
  const [composerKey, setComposerKey] = useState(0);
  const [searchProvider, setSearchProvider] = useState<SearchProvider>('tavily');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    setAuthed(true);
    setHistory(getHistory());
  }, [router]);

  const buildRun = (entry: ChatHistoryEntry): RunModel => {
    let m: RunModel = {
      ...emptyRun(),
      topic: entry.topic,
      report: entry.report,
      error: entry.error,
      startedAt: entry.createdAt,
      running: entry.running ?? false,
    };
    for (const evt of entry.events) {
      m = applyEvent(m, evt, entry.createdAt);
    }
    if (entry.running) m.running = true;
    return m;
  };

  // Register the chat in the sidebar the instant search is pressed. A new
  // search (no entryId) creates a fresh entry; a follow-up (entryId set)
  // appends to its existing chat so it never spawns a separate tab.
  const handleRunStart = useCallback((run: RunModel, topic: string, entryId?: string) => {
    if (entryId) {
      setHistory((prev) => {
        const idx = prev.findIndex((h) => h.id === entryId);
        if (idx < 0) return prev;
        const existing = prev[idx];
        const updated: ChatHistoryEntry = {
          ...existing,
          running: true,
          questions: existing.questions.includes(topic.trim())
            ? existing.questions
            : [...existing.questions, topic.trim()],
          questionCount: existing.questionCount + 1,
        };
        const next = [...prev];
        next[idx] = updated;
        saveRun(updated);
        return next;
      });
      return;
    }
    const entry: ChatHistoryEntry = {
      id: run.startedAt ? `run-${run.startedAt}` : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      topic,
      provider: 'groq',
      createdAt: run.startedAt || Date.now(),
      events: [],
      report: null,
      questions: [topic.trim()],
      questionCount: 1,
      running: true,
      mergeIfSameTopic(newTopic: string) { return topicsShareWords(topic, newTopic); },
    };
    setHistory((prev) => [entry, ...prev.filter((h) => h.id !== entry.id)].slice(0, 30));
    saveRun(entry);
  }, []);

  // Throttled live updates to the running entry so a mid-run page reload
  // still shows the chat instead of losing it.
  const handleRunProgress = useCallback((run: RunModel, _topic: string, events: SwarmEvent[], entryId?: string) => {
    const id = entryId ?? (run.startedAt ? `run-${run.startedAt}` : '');
    if (!id) return;
    setHistory((prev) => {
      const idx = prev.findIndex((h) => h.id === id);
      if (idx < 0) return prev;
      const updated: ChatHistoryEntry = { ...prev[idx], events: trimEventsForStorage(events), running: true };
      const next = [...prev];
      next[idx] = updated;
      saveRun(updated);
      return next;
    });
  }, []);

  // Finalize a finished run. A follow-up updates its own chat in place; a new
  // search becomes its own entry, is selected, and the composer resets.
  const handleSaveRun = useCallback((run: RunModel, topic: string, events: SwarmEvent[], entryId?: string) => {
    const trimmed = topic.trim();
    if (entryId) {
      setHistory((prev) => {
        const idx = prev.findIndex((h) => h.id === entryId);
        if (idx < 0) return prev;
        const existing = prev[idx];
        const updated: ChatHistoryEntry = {
          ...existing,
          events: trimEventsForStorage(events),
          report: run.report ?? existing.report,
          error: run.error ?? existing.error,
          running: false,
          questions: existing.questions.includes(trimmed)
            ? existing.questions
            : [...existing.questions, trimmed],
          questionCount: existing.questionCount + 1,
        };
        const next = [...prev];
        next[idx] = updated;
        saveRunAll(next);
        return next;
      });
      setSelectedId(entryId);
      return;
    }
    const id = run.startedAt ? `run-${run.startedAt}` : `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const fresh: ChatHistoryEntry = {
      id,
      topic,
      provider: 'groq',
      createdAt: run.startedAt || Date.now(),
      events: trimEventsForStorage(events),
      report: run.report,
      questions: [trimmed],
      questionCount: 1,
      running: false,
      mergeIfSameTopic(newTopic: string) { return topicsShareWords(topic, newTopic); },
      error: run.error,
    };
    const next = [fresh, ...getHistory().filter((h) => h.id !== id)].slice(0, 30);
    setHistory(next);
    saveRunAll(next);
    setSelectedId(id);
    setComposerKey((k) => k + 1);
  }, []);

  const loadRun = (entry: ChatHistoryEntry) => {
    setSelectedId(entry.id);
    setMode('chat');
  };

  const confirmLogout = () => {
    logout();
    router.replace('/login');
  };

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep animate-ping" />
      </div>
    );
  }

  const session = getSession();
  const selected = history.find((h) => h.id === selectedId) ?? null;
  const selectedRun = selected ? buildRun(selected) : null;
  // Kanban/Resources show the selected chat's board, falling back to the most
  // recent run so they're never blank while a swarm is in flight.
  const displayRun = selectedRun ?? (history.length > 0 ? buildRun(history[0]) : null);

  return (
    <div className="h-screen flex overflow-hidden relative bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 p-4">Skip to main content</a>
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
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-primary via-brand-highlight to-brand-deep flex items-center justify-center text-white font-bold shadow-brand-glow">
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
              setMode('chat');
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-primary via-brand-highlight to-brand-deep text-white py-2.5 px-3 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-brand-glow"
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
            <div
              key={h.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                loadRun(h);
                setSidebarOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  loadRun(h);
                  setSidebarOpen(false);
                }
              }}
              className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all duration-200 group ${
                selectedId === h.id
                  ? 'bg-surface border-brand-primary shadow-[0_0_0_1px_rgba(84,186,185,0.25)]'
                  : 'bg-surface/50 border-black/5 dark:border-white/10 hover:bg-surface hover:border-brand-primary/60 hover:shadow-soft'
              }`}
            >
              <div className='flex items-center gap-2'>
                <span className='font-medium truncate text-ink'>{h.report?.title || h.topic}</span>
              </div>
              {h.running && (
                <div className="mt-1 font-mono text-[10px] text-brand-deep dark:text-brand-highlight animate-pulse">
                  ◌ Running…
                </div>
              )}
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
                    ⚡ groq
                  </span>
                  {h.running ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" title="running" />
                  ) : h.report ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="report ready" />
                  ) : h.error ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* User */}
        <div className="px-4 py-4 border-t border-black/5 dark:border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-primary to-brand-deep flex items-center justify-center text-white font-bold text-sm">
            {(session?.name || 'B')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{session?.name || 'Builder'}</div>
            <div className="text-[11px] text-muted truncate">{session?.email}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main id="main" className="flex-1 flex flex-col min-w-0">
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

          {/* Mode toggle: Chat | Kanban | Resources */}
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
            <button
              onClick={() => setMode('resources')}
              className={`font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${
                mode === 'resources'
                  ? 'bg-surface text-ink shadow-soft'
                  : 'text-muted hover:text-ink'
              }`}
            >
              🔗 Resources
            </button>
          </div>

          {/* Provider */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border bg-brand-deep text-white border-brand-deep">
              ⚡ Groq
            </span>
            <button
              type="button"
              onClick={() => setSearchProvider((provider) => (provider === 'tavily' ? 'exa' : 'tavily'))}
              aria-pressed={searchProvider === 'exa'}
              className="font-mono text-[9px] uppercase tracking-widest px-3 py-1 rounded-full border border-brand-primary text-brand-deep dark:text-brand-highlight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            >
              Search: {searchProvider}
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* Content — composer and the selected chat are separate, isolated
            instances so an in-flight run never bleeds into another chat. */}
        <div className="flex-1 min-h-0 relative flex">
          {/* Composer: where new searches launch and stream (shown only in
              chat mode with no history chat selected). */}
          <div className={mode === 'chat' && selectedId === null ? 'absolute inset-0 flex' : 'absolute inset-0 hidden'}>
            <ChatView
              key={`composer-${composerKey}`}
              loadedRun={null}
              onSaveRun={handleSaveRun}
              onRunStart={handleRunStart}
              onRunProgress={handleRunProgress}
              searchProvider={searchProvider}
            />
          </div>

          {/* Selected chat: its own live view — follow-ups launched here stay
              in this chat. */}
          <div className={mode === 'chat' && selectedId !== null ? 'absolute inset-0 flex' : 'absolute inset-0 hidden'}>
            {selected && selectedRun && (
              <ChatView
                key={`view-${selected.id}`}
                entryId={selected.id}
                loadedRun={selectedRun}
                loadedKey={selected.id}
                loadedQuestions={selected.questions}
                onSaveRun={handleSaveRun}
                onRunStart={handleRunStart}
                onRunProgress={handleRunProgress}
                searchProvider={searchProvider}
              />
            )}
          </div>

          <div className={mode === 'kanban' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
            <KanbanView run={displayRun} />
          </div>
          <div className={mode === 'resources' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
            <ResourcesView run={displayRun} />
          </div>
        </div>
      </main>
    </div>
  );
}
