'use client';

import { useEffect, useRef, useState } from 'react';
import type { SwarmEvent } from '@/lib/types';
import type { RunModel } from '@/lib/runModel';
import { applyEvent, emptyRun } from '@/lib/runModel';
import { newId } from '@/lib/history';
import Swarm3D from '@/components/Swarm3D';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  kind?: 'text' | 'report' | 'error';
  run?: RunModel;
  at: number;
}

interface ChatViewProps {
  provider: 'demo' | 'groq';
  loadedRun?: RunModel | null;
  loadedKey?: string;
  onSaveRun: (run: RunModel, topic: string, events: SwarmEvent[]) => void;
  onActiveRunChange: (run: RunModel | null) => void;
}

export function ChatView({
  provider,
  loadedRun,
  loadedKey,
  onSaveRun,
  onActiveRunChange,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<RunModel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventsRef = useRef<SwarmEvent[]>([]);

  const welcome =
    "Hi! I'm Synth. Give me a topic and I'll dispatch a fleet of parallel agents to research it — then synthesize a full report. Try something like *'state of AI startups in India'*.";

  const bootMessages = (): Message[] => [
    { id: 'welcome', role: 'assistant', text: welcome, kind: 'text', at: Date.now() },
  ];

  useEffect(() => {
    setMessages(bootMessages());
  }, []);

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
    const userMsg: Message | null = loadedRun.topic
      ? { id: `loaded-u-${loadedKey ?? loadedRun.startedAt}`, role: 'user', text: loadedRun.topic, at: loadedRun.startedAt || Date.now() }
      : null;
    setMessages((prev) => {
      const base = prev.filter((m) => !m.id.startsWith('loaded-'));
      const next = userMsg ? [...base, userMsg, reportMsg] : [...base, reportMsg];
      return next;
    });
    setCurrentRun(loadedRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, currentRun]);

  const appendLog = (run: RunModel, evt: SwarmEvent): RunModel => {
    return applyEvent(run, evt, Date.now());
  };

  const handleEvent = (run: RunModel, evt: SwarmEvent): RunModel => {
    const updated = appendLog(run, evt);
    eventsRef.current.push(evt);
    setCurrentRun((prev) => (prev ? { ...prev, ...updated } : updated));
    return updated;
  };

  const launch = async (topicText: string) => {
    if (!topicText.trim() || running) return;

    const sessionId = newId();

    // user message
    setMessages((prev) => [
      ...prev,
      { id: sessionId + '-u', role: 'user', text: topicText, at: Date.now() },
    ]);
    setInput('');

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
      topic: topicText,
      startedAt: Date.now(),
      running: true,
    };
    eventsRef.current = [];
    setCurrentRun(run);
    onActiveRunChange(run);
    setRunning(true);

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topicText,
          provider,
          sessionId,
        }),
      });

      if (!res.ok) throw new Error(`swarm endpoint responded ${res.status}`);
      if (!res.body) throw new Error('no SSE stream returned');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let runState = run;

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
                runState = handleEvent(runState, evt);
              } catch {
                /* ignore non-JSON frames */
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      const final = runState;
      setCurrentRun((prev) => (prev ? { ...prev, running: false } : prev));
      setRunning(false);

      // promote placeholder to final report
      const reportText =
        final.report?.summary ??
        final.error ??
        'Hmm, the swarm returned without a report. Try a different topic.';
      const kind = final.error ? 'error' : final.report ? 'report' : 'text';

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

      onSaveRun(final, topicText, eventsRef.current);
      onActiveRunChange(final);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'swarm failed unexpectedly';
      setMessages((prev) =>
        prev.map((m) => (m.id === sessionId + '-a' ? { ...m, text: msg, kind: 'error' } : m))
      );
      setCurrentRun((prev) => (prev ? { ...prev, running: false } : prev));
      setRunning(false);
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
              <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-gradient-to-r from-cyan-500/15 via-violet-500/15 to-fuchsia-500/15 border border-black/5 dark:border-white/10 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {m.text}
              </div>
            </div>
          ) : m.kind === 'report' && m.run ? (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%]">
                {/* 3D avatar */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 flex items-center justify-center text-white text-[10px] font-mono font-bold">
                    S
                  </span>
                  <span className="text-xs font-medium text-muted">Synth</span>
                </div>
                <div className="tilt-scene">
                  <div className="tilt-card glass rounded-2xl border border-black/5 dark:border-white/10 p-5">
                    <div className="tilt-card-inner">
                      <ReportBody run={m.run} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[92%]">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 flex items-center justify-center text-white text-[10px] font-mono font-bold">
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
        {currentRun?.running && (
          <div className="flex justify-start">
            <div className="w-full max-w-[92%]">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 flex items-center justify-center text-white text-[10px] font-mono font-bold animate-pulse">
                  S
                </span>
                <span className="text-xs font-medium text-muted">swarm in flight</span>
              </div>
              <LiveSwarmPanel run={currentRun} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={submit} className="p-4 lg:px-8 pb-6 pt-2">
        <div className="relative group">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 opacity-25 blur group-focus-within:opacity-60 transition-opacity" />
          <div className="relative flex items-center gap-2 rounded-2xl bg-surface border border-black/10 dark:border-white/10 p-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask the swarm to research anything…"
              className="flex-1 px-3 py-2.5 bg-transparent focus:outline-none text-[15px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || running}
              className="disabled:opacity-40 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 text-white text-sm font-semibold transition-transform hover:scale-[1.03] active:scale-[0.97]"
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

function LiveSwarmPanel({ run }: { run: RunModel }) {
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
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
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

      {active ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {run.tasks.map((t, i) => (
            <MiniReport key={t.id} task={t} index={i} />
          ))}
        </div>
      ) : (
        <div className="h-32 flex items-center justify-center">
          <Swarm3D active className="w-40 h-40" />
        </div>
      )}
    </div>
  );
}

function MiniReport({ task, index }: { task: RunModel['tasks'][number]; index: number }) {
  const palettes = [
    { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', step: 'bg-cyan-500' },
    { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', step: 'bg-violet-500' },
    { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', step: 'bg-fuchsia-500' },
    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', step: 'bg-emerald-500' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', step: 'bg-amber-500' },
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
      <div className={`mt-1.5 text-[11px] leading-snug line-clamp-3 ${p.text}`}>{task.title}</div>
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

      {run.report?.summary && (
        <p className="text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
          {run.report.summary}
        </p>
      )}

      {run.report?.sections?.length ? (
        <div className="mt-4 space-y-4">
          {run.report.sections.map((s, i) => (
            <div key={i}>
              <h4 className="font-mono text-xs uppercase tracking-widest text-violet-600 mb-1">
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
                <h4 className="font-mono text-xs uppercase tracking-widest text-violet-600 mb-1">
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
