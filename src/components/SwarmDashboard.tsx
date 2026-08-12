'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, Plan, Gap, Report, SwarmEvent } from '@/lib/types';

/* ------------------------------------------------------------------------- *
 * Local types
 * ------------------------------------------------------------------------- */

interface LogEntry {
  id: number;
  time: string;
  tag: string;
  message: string;
  hue: 'cyan' | 'green' | 'amber' | 'violet' | 'red' | 'dim';
}

interface GapRecord {
  reasoning: string;
  missing: string[];
  loopNumber: number;
  at: number;
}

/* ------------------------------------------------------------------------- *
 * Helpers
 * ------------------------------------------------------------------------- */

let idCounter = 0;
const nextId = () => ++idCounter;

const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

type Status = Task['status'];

const STATUS_META: Record<
  Status,
  { label: string; text: string; border: string; glow: string; dot: string }
> = {
  pending: {
    label: 'QUEUED',
    text: 'text-slate-400',
    border: 'border-slate-700/60',
    glow: 'shadow-none',
    dot: 'bg-slate-600',
  },
  working: {
    label: 'WORKING',
    text: 'text-cyan-300',
    border: 'border-cyan-500/50',
    glow: 'shadow-[0_0_24px_rgba(34,211,238,0.15)]',
    dot: 'bg-cyan-400 animate-pulse',
  },
  done: {
    label: 'COMPLETE',
    text: 'text-emerald-300',
    border: 'border-emerald-500/50',
    glow: 'shadow-[0_0_24px_rgba(52,211,153,0.15)]',
    dot: 'bg-emerald-400',
  },
  failed: {
    label: 'FAILED',
    text: 'text-rose-300',
    border: 'border-rose-500/50',
    glow: 'shadow-[0_0_24px_rgba(248,113,113,0.15)]',
    dot: 'bg-rose-400',
  },
};

const LOG_HUES: Record<string, LogEntry['hue']> = {
  SYS: 'cyan',
  PLAN: 'violet',
  TASK: 'green',
  GAP: 'amber',
  LOOP: 'amber',
  DONE: 'green',
  ERR: 'red',
};

function logHue(tag: string): LogEntry['hue'] {
  return LOG_HUES[tag] ?? 'dim';
}

const HUE_CLASS: Record<LogEntry['hue'], string> = {
  cyan: 'text-cyan-300',
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  violet: 'text-violet-300',
  red: 'text-rose-300',
  dim: 'text-slate-500',
};

/* ------------------------------------------------------------------------- *
 * Sub-components
 * ------------------------------------------------------------------------- */

/** Orbiting core visual — animated when swarm active */
function SwarmCore({ active }: { active: boolean }) {
  const orbits = [
    { r: 'w-44 h-44', dur: '24s', delay: '0s' },
    { r: 'w-72 h-72', dur: '30s', delay: '-5s' },
    { r: 'w-96 h-96', dur: '38s', delay: '-12s' },
  ];
  const hue = ['bg-cyan-400', 'bg-violet-400', 'bg-emerald-400'];

  return (
    <div className="relative flex items-center justify-center h-[22rem] overflow-hidden rounded-2xl border border-edge/60 bg-abyss/60 backdrop-blur-sm">
      {/* Center core */}
      <div className="relative z-10 flex flex-col items-center gap-1 select-none">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 via-violet-500 to-emerald-400 opacity-90 blur-[1px]" />
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-400">
          {active ? 'swarm active' : 'idle'}
        </div>
        <div className="font-mono text-[9px] text-slate-600 tracking-widest">SYNTH CORE</div>
      </div>

      {/* Orbits */}
      {orbits.map((o, i) => (
        <div
          key={i}
          className={`absolute ${o.r} ${active ? 'animate-spin-slow' : 'opacity-40'} pointer-events-none`}
          style={{ animationDuration: o.dur, animationDelay: o.delay }}
        >
          {/* Ring */}
          <div
            className="absolute inset-0 rounded-full border border-dashed border-white/10"
            style={{ transform: `rotateX(${60 + i * 8}deg) rotateY(${10 + i * 12}deg)` }}
          />
          {/* Orbiting node */}
          <div
            className={`absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ${hue[i]} shadow-neon-cyan`}
          />
        </div>
      ))}

      {/* Radial whisper behind */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.06),transparent_60%)]" />
    </div>
  );
}

/** Volume meter of agent activity */
function ActivityMeter({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => {
    let working = 0,
      done = 0,
      failed = 0;
    tasks.forEach((t) => {
      if (t.status === 'working') working++;
      else if (t.status === 'done') done++;
      else if (t.status === 'failed') failed++;
    });
    const pending = tasks.length - working - done - failed;
    return { working, done, failed, pending, total: tasks.length };
  }, [tasks]);

  const max = Math.max(counts.total, 1);

  return (
    <div className="flex items-center gap-6">
      {(
        [
          ['ACTIVE', counts.working, 'bg-cyan-400', 'text-cyan-300'],
          ['DONE', counts.done, 'bg-emerald-400', 'text-emerald-300'],
          ['FAILED', counts.failed, 'bg-rose-400', 'text-rose-300'],
        ] as const
      ).map(([label, val, bar, txt]) => (
        <div key={label} className="flex items-center gap-2">
          <div className="w-20 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${bar} transition-all duration-500`}
              style={{ width: `${(val / max) * 100}%` }}
            />
          </div>
          <span className={`font-mono text-[10px] ${txt} tabular-nums`}>
            {label} {val}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Individual agent card with 3D tilt + hover glow */
function AgentCard({ task, index }: { task: Task; index: number }) {
  const meta = STATUS_META[task.status];
  const thinking = task.thinking;
  const showThinking = task.status === 'working' && thinking;

  let body: string;
  if (task.status === 'failed') body = task.error || 'Task failed';
  else if (task.status === 'done') body = (task.result || '').slice(0, 220);
  else if (task.status === 'working') body = showThinking ? thinking : 'Working…';
  else body = 'Queued in swarm';

  const accents: Record<string, string> = {
    sl: 'text-cyan-300',
    azul: 'text-violet-300',
    em: 'text-emerald-300',
    am: 'text-amber-300',
    ro: 'text-rose-300',
  };
  const accent = accents[['sl', 'azul', 'em', 'am', 'ro'][index % 5]] ?? 'text-cyan-300';

  return (
    <div className="tilt-scene group h-full">
      <div
        className={`tilt-card relative h-full rounded-2xl bg-panel/80 border ${meta.border} backdrop-blur-sm p-5 overflow-visible`}
      >
        <div className="tilt-ring" />

        <div className="tilt-card-inner flex flex-col h-full gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${meta.dot} ${meta.glow} ${
                  task.status === 'working' ? 'status-dot' : ''
                }`}
              />
              <span className="font-mono text-[11px] tracking-widest text-slate-400">
                AGENT-{String(index + 1).padStart(2, '0')}
              </span>
            </div>
            <span
              className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/5 ${meta.text}`}
            >
              {meta.label}
            </span>
          </div>

          {/* Title */}
          <div className={`font-semibold text-sm leading-snug ${accent}`}>{task.title}</div>

          {/* Body / thinking */}
          <div
            className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${meta.text} ${
              showThinking ? 'animate-think' : task.status === 'pending' ? 'opacity-50' : ''
            } flex-1`}
          >
            {body}
          </div>

          {/* Sources */}
          {task.sources && task.sources.length > 0 && (
            <details className="mt-auto border-t border-white/5 pt-2 group-open:border-cyan-500/30">
              <summary className="font-mono text-[9px] uppercase tracking-widest text-slate-500 hover:text-cyan-300 cursor-pointer select-none list-none flex items-center gap-1 transition-colors">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span>
                {task.sources.length} SOURCE{task.sources.length > 1 ? 'S' : ''}
              </summary>
              <div className="mt-2 space-y-2">
                {task.sources.map((s, i) => (
                  <div key={i} className="border-l-2 border-cyan-500/30 pl-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-200 hover:underline truncate block text-[11px]
                                 transition-colors"
                    >
                      {s.title}
                    </a>
                    <div className="text-slate-600 text-[10px] truncate">{s.snippet.slice(0, 90)}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

/** Planner reasoning banner */
function PlannerPanel({ plan }: { plan: Plan | null }) {
  if (!plan) return null;
  return (
    <div className="hover-lift rounded-2xl border border-violet-500/25 bg-gradient-to-r from-violet-950/60 to-cyan-950/40 p-5 my-5 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-violet-300">
          Planner Rationale
        </span>
      </div>
      <p className="text-sm text-violet-100/80 leading-relaxed">{plan.reasoning}</p>
      <div className="mt-3 font-mono text-[10px] text-violet-400/70 tracking-wider">
        {plan.tasks.length} AGENTS DEPLOYED · PARALLEL EXECUTION
      </div>
    </div>
  );
}

/** Gap / redispatch banner */
function GapBanner({ gap }: { gap: GapRecord }) {
  const ids = gap.missing && gap.missing.length ? gap.missing : [];
  return (
    <div className="hover-lift rounded-2xl border-l-4 border-amber-400 bg-amber-950/30 p-4 my-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
        Gap Detected — Loop {gap.loopNumber + 1}
      </div>
      <p className="mt-2 text-sm text-amber-100/80 whitespace-pre-wrap">{gap.reasoning}</p>
      {ids.length > 0 && (
        <div className="mt-2 font-mono text-[11px] text-amber-300">
          REDISPATCHING: {ids.join(' · ')}
        </div>
      )}
    </div>
  );
}

/** Live terminal log */
function ActivityLog({ logs, logRef }: { logs: LogEntry[]; logRef: React.Ref<HTMLDivElement> }) {
  return (
    <div className="rounded-2xl border border-edge/60 bg-abyss/70 backdrop-blur-sm font-mono text-xs overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-edge/60">
        <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        <span className="ml-2 text-[10px] uppercase tracking-[0.3em] text-slate-400">
          swarm.terminal
        </span>
      </div>
      <div ref={logRef} className="custom-scroll h-56 overflow-y-auto p-4 space-y-1">
        {logs.length === 0 && (
          <div className="text-slate-600">
            <span className="text-cyan-500">$</span> awaiting swarm handshake…
            <span className="blink-caret text-cyan-400">▋</span>
          </div>
        )}
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2 leading-snug items-baseline">
            <span className="text-slate-600 shrink-0">[{entry.time}]</span>
            <span className={`shrink-0 font-semibold ${HUE_CLASS[entry.hue]}`}>
              {entry.tag}:
            </span>
            <span className="text-slate-300/90 break-all">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Final report viewer */
function ReportViewer({ report }: { report: Report | null }) {
  if (!report) return null;
  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-abyss/70 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 status-dot" />
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-300">
            Final Report
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-500">
          {report.loopsUsed ?? 1} LOOP{(report.loopsUsed ?? 1) > 1 ? 'S' : ''}
        </span>
      </div>

      {report.summary && (
        <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">{report.summary}</p>
      )}
      {Array.isArray(report.sections) &&
        report.sections.map((s, i) => (
          <div key={i} className="mt-5">
            <h3 className="font-mono text-xs uppercase tracking-widest text-emerald-400 mb-1.5">
              {s.title}
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{s.content}</p>
          </div>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Main dashboard
 * ------------------------------------------------------------------------- */

export function SwarmDashboard() {
  const [topic, setTopic] = useState('');
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Record<string, Task>>({});
  const [gaps, setGaps] = useState<GapRecord[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [provider, setProvider] = useState<'demo' | 'groq'>('demo');
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const appendLog = useCallback((tag: string, message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: nextId(), time: nowTime(), tag, message, hue: logHue(tag) },
    ]);
  }, []);

  const setTask = useCallback((task: Task) => {
    setTasks((prev) => ({ ...prev, [task.id]: task }));
  }, []);

  const handleEvent = useCallback(
    (evt: SwarmEvent) => {
      switch (evt.type) {
        case 'plan_ready': {
          setPlan(evt.plan);
          const map: Record<string, Task> = {};
          evt.plan.tasks.forEach((t) => (map[t.id] = t));
          setTasks((prev) => ({ ...prev, ...map }));
          appendLog('PLAN', `planning complete — ${evt.plan.tasks.length} agents deployed`);
          break;
        }

        case 'task_update': {
          setTask(evt.task);
          const st = evt.task.status;
          appendLog(
            'TASK',
            `agent ${evt.task.id} ${st}${st === 'done' || st === 'failed' ? '' : '…'}`
          );
          break;
        }

        case 'gap_detected': {
          setGaps((prev) => [
            ...prev,
            {
              reasoning: evt.gap.reasoning,
              missing: evt.gap.missing || [],
              loopNumber: evt.loopNumber,
              at: Date.now(),
            },
          ]);
          appendLog('GAP', `gap detected — ${evt.gap.reasoning.slice(0, 80)}`);
          break;
        }

        case 'redispatch': {
          setTasks((prev) => {
            const next = { ...prev };
            evt.taskIds.forEach((id) => {
              if (next[id]) next[id] = { ...next[id], status: 'working' };
            });
            return next;
          });
          appendLog(
            'LOOP',
            `redispatching: ${evt.taskIds.length ? evt.taskIds.join(', ') : 'repair team'}`
          );
          break;
        }

        case 'final_report': {
          setReport(evt.report);
          appendLog('DONE', `final report ready (${evt.report.loopsUsed ?? 1} loops)`);
          break;
        }

        case 'agent_thinking': {
          appendLog('TASK', `agent ${evt.taskId}: ${evt.status}`);
          break;
        }

        case 'error': {
          setRunning(false);
          setError(evt.message);
          appendLog('ERR', evt.message);
          break;
        }

        default:
          break;
      }
    },
    [appendLog, setTask]
  );

  const launchSwarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || running) return;

    setRunning(true);
    setError(null);
    setPlan(null);
    setTasks({});
    setGaps([]);
    setReport(null);
    setLogs([]);

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          provider,
          sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        }),
      });

      if (!res.ok) throw new Error(`swarm endpoint responded ${res.status}`);
      if (!res.body) throw new Error('no SSE stream returned');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
                handleEvent(JSON.parse(raw) as SwarmEvent);
              } catch {
                /* ignore non-JSON frames */
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'swarm failed unexpectedly';
      setError(msg);
      appendLog('ERR', msg);
    } finally {
      setRunning(false);
    }
  };

  const taskList = Object.values(tasks);

  return (
    <main className="relative min-h-screen max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 z-10">
      {/* Hero header */}
      <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-neon-cyan" />
            <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-cyan-300 glitch-text">
              Synth
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500 border border-white/10 px-2 py-0.5 rounded-full">
              mission control · v1
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Swarm{' '}
            <span className="cta-gradient font-extrabold">Deep Research</span>
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            type a topic → a fleet of parallel AI agents plans, researches, synthesizes and loops
          </p>
        </div>

        {/* Provider toggle */}
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-panel/60 p-1 backdrop-blur-sm self-start sm:self-auto">
          {(['demo', 'groq'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              disabled={running}
              className={`font-mono text-[10px] uppercase tracking-widest px-4 py-1.5 rounded-full transition-all ${
                provider === p
                  ? p === 'groq'
                    ? 'bg-violet-500/30 text-violet-200 shadow-neon-violet'
                    : 'bg-cyan-500/30 text-cyan-200 shadow-neon-cyan'
                  : 'text-slate-500 hover:text-slate-300'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {p === 'groq' ? '⚡ Groq' : '◈ Demo'}
            </button>
          ))}
        </div>
      </header>

      {/* Topic input */}
      <form onSubmit={launchSwarm} className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1 group">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-emerald-500/20 opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100" />
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic for the swarm to research…"
            className="relative w-full bg-panel/80 border border-edge/80 rounded-xl px-4 py-3 font-mono text-sm text-gray-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!topic.trim() || running}
          className="group relative rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 p-px disabled:opacity-40 disabled:cursor-not-allowed transition-transform hover:scale-[1.02] active:scale-[0.99]"
        >
          <span className="flex items-center justify-center gap-2 px-6 py-3 rounded-[11px] bg-void font-mono text-sm font-bold uppercase tracking-widest text-white transition-colors group-hover:bg-transparent">
            {running ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running
              </>
            ) : (
              <>Launch Swarm ⚡</>
            )}
          </span>
        </button>
      </form>

      {/* Agent activity meter */}
      <div className="mb-6">
        <ActivityMeter tasks={taskList} />
      </div>

      {/* Swarm core 3D visual */}
      <SwarmCore active={running} />

      {/* Planner rationale */}
      <PlannerPanel plan={plan} />

      {/* Agent grid */}
      {taskList.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 my-5">
          {taskList.map((task, i) => (
            <AgentCard key={task.id} task={task} index={i} />
          ))}
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="my-4">
          {gaps.map((g, i) => (
            <GapBanner key={`${g.at}-${i}`} gap={g} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="my-4 rounded-xl border-l-4 border-rose-500 bg-rose-950/40 p-4 font-mono text-sm text-rose-200 backdrop-blur-sm">
          ⚠ {error}
        </div>
      )}

      {/* Report */}
      <div className="my-5">
        <ReportViewer report={report} />
      </div>

      {/* Terminal log */}
      <div className="my-5">
        <ActivityLog logs={logs} logRef={logRef} />
      </div>

      <footer className="mt-10 pb-6 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-slate-600">
        built with agent orchestrator · parallel swarms · sse live feed
      </footer>
    </main>
  );
}

export default SwarmDashboard;