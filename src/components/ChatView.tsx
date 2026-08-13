'use client';

import { useEffect, useRef, useState } from 'react';
import type { SearchProvider, SwarmEvent } from '@/lib/types';
import type { RunModel } from '@/lib/runModel';
import { applyEvent, emptyRun } from '@/lib/runModel';
import { newId } from '@/lib/history';
import { displayTitle, followUpBase } from '@/lib/topic';
import Swarm3D from '@/components/Swarm3D';

// Continuation phrases that mean "go deeper on the previous topic" rather than
// a brand-new research subject. Matched against the whole trimmed input.
const FOLLOW_UP_RE =
  /^(explain more|explain further|expound|elaborate|expand on|expand more|elaborate more|go deeper|dive deeper|dive in|break it down|break this down|simplify|make it simpler|clarify|tell me more|more about this|more details?|more|give me more|continue|keep going|keep explaining|so what|is that all|anything else|for example|give examples|and what about|what about it)\s*[!?.]*$/i;

const MAX_CONCURRENT_RUNS = 5;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'text' | 'report' | 'error' | 'questions';
  questions?: string[];
  run?: RunModel;
  at: number;
}

interface ChatViewProps {
  loadedRun?: RunModel | null;
  loadedKey?: string;
  loadedQuestions?: string[];
  sessionToken?: number;
  onSaveRun: (run: RunModel, topic: string, events: SwarmEvent[]) => void;
  onActiveRunChange: (run: RunModel | null) => void;
  searchProvider: SearchProvider;
}

export function ChatView({
  loadedRun,
  loadedKey,
  loadedQuestions,
  sessionToken = 0,
  onSaveRun,
  onActiveRunChange,
  searchProvider,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<RunModel | null>(null);
  const [activeRuns, setActiveRuns] = useState<Map<string, RunModel>>(new Map());
  const [metrics, setMetrics] = useState({ researcher: 0, synthesis: 0, loops: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<Map<string, SwarmEvent[]>>(new Map());
  const activeRunCount = useRef(0);
  // Original (dash-stripped) subject of the last run, so follow-ups like
  // "explain more" expand against the real topic instead of being searched
  // as their own subject.
  const followUpBaseRef = useRef<string | null>(null);

  const welcome =
    "Hi! I'm Synth. Give me a topic and I'll dispatch a fleet of parallel agents to research it — then synthesize a full report. Try something like *'state of AI startups in India'*.";

  const bootMessages = (): Message[] => [
    { id: 'welcome', role: 'assistant', text: welcome, kind: 'text', at: Date.now() },
  ];

  useEffect(() => {
    setMessages(bootMessages());
    setCurrentRun(null);
    setActiveRuns(new Map());
    setRunning(false);
    activeRunCount.current = 0;
    eventsRef.current = new Map();
    followUpBaseRef.current = null;
    setMetrics({ researcher: 0, synthesis: 0, loops: 0 });
  }, [sessionToken]);

  // When a run from history is loaded externally, show it as a report message
  useEffect(() => {
    if (!loadedRun) return;
    if (loadedRun.running) {
      setCurrentRun(loadedRun);
      return;
    }
    const reportMsg: Message = {
      id: `loaded-${loadedKey ?? loadedRun.startedAt}`,
      role: 'assistant',
      text:
        loadedRun.report?.summary ??
        loadedRun.error ??
        'Run completed (report not stored).',
      kind: loadedRun.error ? 'error' : loadedRun.report ? 'report' : 'text',
      run: loadedRun,
      at: loadedRun.startedAt || Date.now(),
    };
    const questionsMsg: Message | null = loadedQuestions?.length
      ? {
          id: `loaded-q-${loadedKey ?? loadedRun.startedAt}`,
          role: 'assistant',
          text: 'Questions studied in this thread',
          kind: 'questions',
          questions: loadedQuestions,
          at: loadedRun.startedAt || Date.now(),
        }
      : null;
    const userMsg: Message | null = loadedRun.topic
      ? { id: `loaded-u-${loadedKey ?? loadedRun.startedAt}`, role: 'user', text: loadedRun.topic, at: loadedRun.startedAt || Date.now() }
      : null;
    // Replace the thread entirely — each history chat is its own conversation.
    setMessages(
      (userMsg ? [userMsg] : []).concat(questionsMsg ? [questionsMsg] : [], reportMsg)
    );
    setCurrentRun(loadedRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, loadedQuestions]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, currentRun, activeRuns]);

  const appendLog = (run: RunModel, evt: SwarmEvent): RunModel => {
    return applyEvent(run, evt, Date.now());
  };

  const handleEvent = (runId: string, run: RunModel, evt: SwarmEvent): RunModel => {
    const updated = appendLog(run, evt);
    const events = eventsRef.current.get(runId) ?? [];
    eventsRef.current.set(runId, [...events, evt]);
    setActiveRuns((prev) => {
      const next = new Map(prev);
      next.set(runId, updated);
      return next;
    });
    setCurrentRun(updated);
    onActiveRunChange(updated);
    return updated;
  };

  const launch = async (topicText: string) => {
    const inputText = topicText.trim();
    if (!inputText) return;

    // Continuation phrases ("explain more", "go deeper", …) apply to the
    // previous topic, never as a literal new subject.
    let text = inputText;
    if (FOLLOW_UP_RE.test(inputText) && followUpBaseRef.current) {
      text = `${followUpBaseRef.current} — ${inputText}`;
    } else if (!FOLLOW_UP_RE.test(inputText)) {
      followUpBaseRef.current = followUpBase(inputText);
    }

    const sessionId = newId();

    // Register the user's question immediately — never silently drop it.
    setMessages((prev) => [
      ...prev,
      { id: sessionId + '-u', role: 'user', text: inputText, at: Date.now() },
    ]);
    setInput('');

    if (activeRunCount.current >= MAX_CONCURRENT_RUNS) {
      setMessages((prev) => [
        ...prev,
        {
          id: sessionId + '-limit',
          role: 'assistant',
          text: `You already have ${MAX_CONCURRENT_RUNS} swarms in flight. Please wait for one to finish before starting another.`,
          kind: 'error',
          at: Date.now(),
        },
      ]);
      return;
    }

    activeRunCount.current += 1;
    setRunning(true);

    // assistant placeholder
    setMessages((prev) => [
      ...prev,
      {
        id: sessionId + '-a',
        role: 'assistant',
        text: 'Dispatching swarm…',
        kind: 'text',
        at: Date.now(),
      },
    ]);

    const run: RunModel = {
      ...emptyRun(),
      topic: text,
      startedAt: Date.now(),
      running: true,
    };
    eventsRef.current.set(sessionId, []);
    setActiveRuns((prev) => new Map(prev).set(sessionId, run));
    setCurrentRun(run);
    onActiveRunChange(run);
    setRunning(true);

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: text,
          sessionId,
          searchProvider,
        }),
      });

      if (!res.ok) throw new Error(`swarm endpoint responded ${res.status}`);
      if (!res.body) throw new Error('no SSE stream returned');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let runState = run;
      let planStart = 0;
      let firstWorkerStart = 0;
      let synthesisStart = 0;

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';
          for (const block of blocks) {
            for (const line of block.split(/\r?\n/)) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const raw = trimmed.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;
              try {
                const evt = JSON.parse(raw) as SwarmEvent;
                if (evt.type === 'plan_ready') {
                  planStart = Date.now();
                } else if (evt.type === 'task_update' && evt.task.status === 'working' && !firstWorkerStart) {
                  firstWorkerStart = Date.now();
                } else if (evt.type === 'task_update' && evt.task.status === 'done' && !synthesisStart) {
                  const allFinished = runState.tasks.length > 0 && runState.tasks.every((task) =>
                    task.id === evt.task.id ? evt.task.status !== 'working' : task.status === 'done' || task.status === 'failed'
                  );
                  if (allFinished) synthesisStart = Date.now();
                } else if (evt.type === 'final_report') {
                  const completedAt = Date.now();
                  const workerStart = firstWorkerStart || planStart || completedAt;
                  const synthesisAt = synthesisStart || completedAt;
                  setMetrics({
                    researcher: Math.max(0, synthesisAt - workerStart),
                    synthesis: Math.max(0, completedAt - synthesisAt),
                    loops: evt.report.loopsUsed,
                  });
                }
                runState = handleEvent(sessionId, runState, evt);
              } catch {
                /* ignore non-JSON frames */
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const final = { ...runState, running: false };
      setCurrentRun(final);

      // promote placeholder to final report
      const reportText =
        final.report?.summary ??
        final.error ??
        'Hmm, the swarm returned without a report. Try a different topic.';
      const kind = final.report ? 'report' : final.error ? 'error' : 'text';

      setMessages((prev) =>
        prev.map((m) =>
          m.id === sessionId + '-a'
            ? {
                ...m,
                text: reportText,
                kind,
                run: final,
              }
            : m
        )
      );

      onSaveRun(final, text, eventsRef.current.get(sessionId) ?? []);
      onActiveRunChange(final);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'swarm failed unexpectedly';
      setMessages((prev) =>
        prev.map((m) => (m.id === sessionId + '-a' ? { ...m, text: msg, kind: 'error' } : m))
      );
      const failed: RunModel = { ...run, topic: text, running: false, error: msg };
      setCurrentRun(failed);
      // Persist failed/interrupted runs too so they don't silently vanish.
      onSaveRun(failed, text, eventsRef.current.get(sessionId) ?? []);
      onActiveRunChange(failed);
    } finally {
      activeRunCount.current = Math.max(0, activeRunCount.current - 1);
      setRunning(activeRunCount.current > 0);
      setActiveRuns((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      eventsRef.current.delete(sessionId);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void launch(input);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="custom-scroll flex-1 overflow-y-auto px-4 lg:px-8 py-6 space-y-5">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-gradient-to-r from-brand-primary/15 via-brand-highlight/15 to-brand-deep/15 border border-black/5 dark:border-white/10 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : m.kind === 'questions' ? (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%] glass rounded-2xl border border-black/5 dark:border-white/10 p-4">
                <div className="text-xs font-medium text-muted mb-2">{m.text}</div>
                <div className="space-y-1">
                  {m.questions?.map((q, i) => (
                    <details key={i} className="px-2 py-1 rounded-sm bg-surface/50">
                      <summary className="cursor-pointer text-[11px] text-muted truncate">
                        Q{i + 1}: {q.substring(0, 80)}{q.length > 80 ? '…' : ''}
                      </summary>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          ) : m.kind === 'report' && m.run ? (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%]">
                {/* 3D avatar */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep flex items-center justify-center text-white text-[10px] font-mono font-bold">
                    S
                  </span>
                  <span className="text-xs font-medium text-muted">Synth</span>
                </div>
                <div className="glass rounded-2xl border border-black/5 dark:border-white/10 p-5">
                  <ReportBody run={m.run} />
                </div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep flex items-center justify-center text-white text-[10px] font-mono font-bold">
                    S
                  </span>
                  <span className="text-xs font-medium text-muted">Synth</span>
                </div>
                <div
                  className={`rounded-2xl rounded-tl-sm px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
                    m.kind === 'error'
                      ? 'bg-rose-50 border border-rose-200 text-rose-700'
                      : 'bg-surface/80 border border-black/5 dark:border-white/10 text-ink'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            </div>
          )
        )}

        {/* Live swarm panel — shown while running */}
        {activeRuns.size > 0 && (
          <div className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep flex items-center justify-center text-white text-[10px] font-mono font-bold animate-pulse">
                  S
                </span>
                <span className="text-xs font-medium text-muted">swarm in flight</span>
              </div>
              <LiveSwarmPanel activeRuns={activeRuns} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <footer className="p-4 text-[10px] text-muted border-t border-black/5">
        <div className="flex items-center gap-4">
          <span>Researcher: {metrics.researcher > 0 ? `${Math.round(metrics.researcher / 1000)}s` : '—'}</span>
          <span>Synthesis: {metrics.synthesis > 0 ? `${Math.round(metrics.synthesis / 1000)}s` : '—'}</span>
          <span>Loops: {metrics.loops}</span>
        </div>
      </footer>

      <form onSubmit={submit} className="p-4 lg:px-8 pb-6 pt-2">
        <div className="relative group">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-brand-primary via-brand-highlight to-brand-deep opacity-25 blur group-focus-within:opacity-60 transition-opacity" />
          <div className="relative flex items-center gap-2 rounded-2xl bg-surface border border-black/10 dark:border-white/10 p-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the swarm to research anything…"
              className="flex-1 px-3 py-2.5 bg-transparent focus:outline-none text-[15px]"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="disabled:opacity-40 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-primary via-brand-highlight to-brand-deep text-white text-sm font-semibold transition-transform hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
            >
              {running ? 'Running…' : 'Send ⚡'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Live swarm panel — mini reporters + 3D visual while a run is active
 * ------------------------------------------------------------------------- */

function LiveSwarmPanel({ activeRuns }: { activeRuns: Map<string, RunModel> }) {
  if (activeRuns.size > 1) {
    return (
      <div className="rounded-2xl border border-black/8 dark:border-white/10 bg-surface/60 backdrop-blur p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
            {activeRuns.size} concurrent runs in flight
          </span>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary" />
          </span>
        </div>
        <div className="space-y-4">
          {[...activeRuns.entries()].map(([runId, run]) => (
            <div key={runId}>
              <div className="mb-2 text-sm font-medium text-ink truncate">{run.topic}</div>
              <SingleSwarmPanel run={run} compact />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const run = [...activeRuns.values()][0];
  return run ? <SingleSwarmPanel run={run} /> : null;
}

function SingleSwarmPanel({ run, compact = false }: { run: RunModel; compact?: boolean }) {
  const counts = {
    working: run.tasks.filter((t) => t.status === 'working').length,
    done: run.tasks.filter((t) => t.status === 'done').length,
    failed: run.tasks.filter((t) => t.status === 'failed').length,
    pending: run.tasks.filter((t) => t.status === 'pending').length,
  };
  const active = run.tasks.length > 0;

  return (
    <div className="rounded-2xl border border-black/8 dark:border-white/10 bg-surface/60 backdrop-blur p-5 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-primary" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
            {run.plan ? 'swarm deployed' : 'planning…'}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="text-muted">ACTIVE {counts.working}</span>
          <span className="text-emerald-600">DONE {counts.done}</span>
          <span className="text-rose-600">FAIL {counts.failed}</span>
        </div>
      </div>

      {!compact && (
        <div className="h-40 flex items-center justify-center">
          <Swarm3D active className="w-44 h-44" />
        </div>
      )}

      {active && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {run.tasks.map((t, i) => (
            <MiniReport key={t.id} task={t} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function MiniReport({ task, index }: { task: RunModel['tasks'][number]; index: number }) {
  const palettes = [
    { bg: 'bg-brand-support/40 dark:bg-brand-deep/40', border: 'border-brand-primary/40', text: 'text-brand-deep dark:text-brand-highlight', step: 'bg-brand-primary' },
    { bg: 'bg-brand-primary/10 dark:bg-brand-deep/50', border: 'border-brand-primary/50', text: 'text-brand-deep dark:text-brand-highlight', step: 'bg-brand-deep' },
    { bg: 'bg-brand-deep/10 dark:bg-brand-deep/60', border: 'border-brand-deep/40', text: 'text-brand-deep dark:text-brand-highlight', step: 'bg-brand-highlight' },
    { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', step: 'bg-emerald-500' },
    { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', step: 'bg-amber-500' },
  ];
  const p = palettes[index % palettes.length];
  const status =
    task.status === 'done'
      ? '✓'
      : task.status === 'failed'
      ? '✕'
      : task.status === 'working'
      ? '◌'
      : '·';

  return (
    <div
      className={`rounded-xl border ${p.border} ${p.bg} p-2.5 transition-all duration-300 hover:scale-[1.03] ${
        task.status === 'working' ? 'ring-1 ring-offset-0 ring-current/20 animate-think' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-4 h-4 rounded-full ${p.step} text-white text-[9px] flex items-center justify-center font-bold`}
        >
          {status}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
          A{index + 1}
        </span>
      </div>
      <div className={`mt-1.5 text-[11px] leading-snug line-clamp-3 ${p.text}`}>{displayTitle(task.title)}</div>
      {task.status === 'working' && task.thinking && (
        <div className="mt-1 font-mono text-[10px] text-brand-deep dark:text-brand-highlight animate-think">
          {task.thinking}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Report body — renders the final report in chat
 * ------------------------------------------------------------------------- */

function ReportBody({ run }: { run: RunModel }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-emerald-600">
          ◈ Final Report
        </span>
        <div className="flex items-center gap-3 font-mono text-[10px] text-muted">
          <span>{(run.report?.loopsUsed ?? 1)} loop{(run.report?.loopsUsed ?? 1) > 1 ? 's' : ''}</span>
          <span>{run.tasks.filter((t) => t.status === 'done').length} agents</span>
        </div>
      </div>

      {run.report?.title && (
        <h3 className="text-xl font-bold tracking-tight text-ink mb-2">
          {run.report.title}
        </h3>
      )}

      {run.report?.summary && (
        <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
          {run.report.summary}
        </p>
      )}

      {run.report?.sections?.length ? (
        <div className="mt-4 space-y-4">
          {run.report.sections.map((s, i) => (
            <div key={i}>
              <h4 className="font-mono text-xs uppercase tracking-widest text-brand-deep dark:text-brand-highlight mb-1">
                {s.title}
              </h4>
              <p className="text-sm leading-relaxed text-muted whitespace-pre-wrap">
                {s.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        /* fall back to raw task results */
        <div className="mt-4 space-y-3">
          {run.tasks
            .filter((t) => t.status === 'done' && t.result)
            .map((t, i) => (
              <div key={t.id}>
                <h4 className="font-mono text-xs uppercase tracking-widest text-brand-deep dark:text-brand-highlight mb-1">
                  {t.title}
                </h4>
                  <p className="text-sm leading-relaxed text-muted whitespace-pre-wrap">
                  {t.result}
                </p>
              </div>
            ))}
        </div>
      )}

      {run.gaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-700 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Loop {run.gaps.length} — gaps detected
          </div>
          <p className="text-xs text-amber-800 whitespace-pre-wrap">
            {run.gaps[run.gaps.length - 1].reasoning}
          </p>
        </div>
      )}
    </div>
  );
}
