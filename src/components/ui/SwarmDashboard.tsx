'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, Plan, Gap, Report, SwarmEvent } from '@/lib/types';

/* ------------------------------------------------------------------------- *
 * Local display helpers (shared contract types come from @/lib/types)
 * ------------------------------------------------------------------------- */

interface LogEntry {
  id: number;
  time: string;
  type: string;
  message: string;
  color: string;
}

/** A notable gap/redispatch event rendered as a distinct "WARNING" card. */
interface AlertCard {
  id: number;
  kind: 'gap' | 'redispatch';
  loopNumber: number;
  reasoning: string;
  missing: string[];
  taskIds: string[];
}

const LOG_COLORS: Record<string, string> = {
  plan_ready: 'text-cyan-400',
  task_update: 'text-green-400',
  task_done: 'text-green-400',
  task_failed: 'text-red-400',
  gap_detected: 'text-amber-400',
  redispatch: 'text-orange-400',
  final_report: 'text-white',
  error: 'text-red-500',
  agent_thinking: 'text-purple-400',
  system: 'text-gray-400',
};

const now = () => new Date().toLocaleTimeString('en-US', { hour12: false });

/* ------------------------------------------------------------------------- *
 * Small presentational pieces
 * ------------------------------------------------------------------------- */

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-400/40 border-t-yellow-400" />
  );
}

function StatusBadge({ task }: { task: Task }) {
  switch (task.status) {
    case 'working':
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-mono text-yellow-400">
          <Spinner /> WORKING
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-green-500/15 px-2 py-0.5 text-xs font-mono text-green-400">
          <span className="text-green-400">✓</span> DONE
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-red-500/15 px-2 py-0.5 text-xs font-mono text-red-400">
          <span className="text-red-400">✕</span> FAILED
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded bg-gray-500/15 px-2 py-0.5 text-xs font-mono text-gray-400">
          PENDING
        </span>
      );
  }
}


/* ------------------------------------------------------------------------- *
 * Planner Reasoning Panel — the "why" shown before any task cards.
 * ------------------------------------------------------------------------- */

function PlannerPanel({ plan }: { plan: Plan }) {
  if (!plan.reasoning || plan.reasoning.trim() === '') return null;
  return (
    <section
      aria-label="Planner rationale"
      className="border-l-2 border-cyan-500 bg-cyan-950/15 p-4 rounded-r-lg rounded-l-sm"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs font-bold tracking-widest text-cyan-400">
          ▚ PLANNER RATIONALE
        </span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-600">
          why these tasks
        </span>
      </div>
      <p className="font-mono text-sm leading-relaxed text-cyan-100/90 whitespace-pre-wrap">
        {plan.reasoning}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------------- *
 * Task Grid — one card per task.
 * ------------------------------------------------------------------------- */

function TaskCard({ task }: { task: Task }) {
  const badge = task.id.replace(/^t/i, 'T');
  return (
    <article className="rounded-lg border border-gray-800 bg-[#0d1117]/80 p-4 flex flex-col gap-2 min-h-[110px]">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-xs font-bold text-cyan-400">
          {badge}
        </span>
        <StatusBadge task={task} />
      </div>
      <h3 className="text-sm font-semibold text-[#e6edf3] leading-snug">
        {task.title}
      </h3>
      {task.status === 'done' && task.result && (
        <p className="font-mono text-xs text-gray-400 line-clamp-3">
          {task.result.slice(0, 150)}
          {task.result.length > 150 ? '…' : ''}
        </p>
      )}
      {task.status === 'failed' && (
        <p className="font-mono text-xs text-red-400 line-clamp-3">
          {task.error || 'Task failed'}
        </p>
      )}
      {task.status === 'working' && (
        <p className="font-mono text-xs text-yellow-500/70 animate-pulse">
          ◌ reasoning…
        </p>
      )}
      {task.status === 'pending' && (
        <p className="font-mono text-xs text-gray-600">waiting on dependencies…</p>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------------- *
 * Gap / Redispatch alert cards — the key demo moment.
 * ------------------------------------------------------------------------- */

function AlertCard({ alert }: { alert: AlertCard }) {
  if (alert.kind === 'gap') {
    return (
      <article className="animate-glow rounded-lg border-l-4 border-amber-500 bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400 animate-pulse">▲</span>
          <span className="font-mono text-sm font-bold tracking-widest text-amber-400">
            WARNING: GAP DETECTED
          </span>
          <span className="ml-auto font-mono text-[10px] text-amber-600">
            LOOP {alert.loopNumber}
          </span>
        </div>
        <p className="font-mono text-sm text-amber-100/90 whitespace-pre-wrap">
          {alert.reasoning}
        </p>
        {alert.missing.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {alert.missing.map((m, i) => (
              <span
                key={i}
                className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-300"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </article>
    );
  }

  return (
    <article className="rounded-lg border-l-4 border-orange-500 bg-orange-500/10 p-4 ring-1 ring-orange-500/30">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-orange-400">⟳</span>
        <span className="font-mono text-sm font-bold tracking-widest text-orange-400">
          REDISPATCHING…
        </span>
        <span className="ml-auto font-mono text-[10px] text-orange-600">
          LOOP {alert.loopNumber}
        </span>
      </div>
      <p className="font-mono text-sm text-orange-100/90">
        {alert.taskIds.length > 0
          ? `REDISPATCHING: ${alert.taskIds.map((id) => id.replace(/^t/i, 'Agent ')).join(', ')}`
          : 'Re-queuing agents with fresh instructions.'}
      </p>
      {alert.reasoning && (
        <p className="mt-2 font-mono text-xs text-orange-300/70 italic">
          {alert.reasoning}
        </p>
      )}
    </article>
  );
}


/* ------------------------------------------------------------------------- *
 * Swarm Visual — glowing agent dots.
 * ------------------------------------------------------------------------- */

function SwarmVisual({ tasks, running }: { tasks: Task[]; running: boolean }) {
  const agents = tasks.length > 0 ? tasks : Array.from({ length: 7 });
  return (
    <div className="rounded-xl border border-cyan-900/60 bg-[#0a0f0a]/60 p-4 backdrop-blur">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-bold tracking-widest text-cyan-400">
          ◉ SWARM NETWORK
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-green-400">
          <span className={`inline-block h-2 w-2 rounded-full ${running ? 'bg-green-400 status-dot' : 'bg-gray-600'}`} />
          {running ? 'AGENTS ACTIVE' : agents.length + ' AGENTS SPOOLED'}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {agents.map((_a, i) => {
          const t = tasks[i];
          const active = t?.status === 'working';
          const done = t?.status === 'done';
          const failed = t?.status === 'failed';
          return (
            <span
              key={i}
              title={(t && `${t.id}: ${t.status}`) || 'idle'}
              className={`inline-block h-3 w-3 rounded-full transition ${
                active
                  ? 'bg-yellow-400 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.9)]'
                  : done
                  ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.7)]'
                  : failed
                  ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]'
                  : 'bg-gray-600'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Activity Log Feed — terminal green on dark.
 * ------------------------------------------------------------------------- */

function ActivityLog({ logs }: { logs: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="rounded-lg border border-green-900/50 bg-[#0a0f0a] p-3 h-64 overflow-y-auto font-mono text-xs leading-relaxed">
      {logs.length === 0 && (
        <div className="text-green-700">
          <span className="text-green-400">$</span> awaiting swarm handshake…<span className="blink-caret">▊</span>
        </div>
      )}
      {logs.map((log) => (
        <div key={log.id} className="flex gap-2 py-0.5 border-b border-green-900/20 last:border-0">
          <span className="shrink-0 text-gray-600">[{log.time}]</span>
          <span className={`shrink-0 font-bold ${log.color}`}>{log.type.toUpperCase()}</span>
          <span className={`whitespace-pre-wrap break-words ${log.color}`}>{log.message}</span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Final Report Viewer.
 * ------------------------------------------------------------------------- */

function ReportViewer({ report }: { report: Report | null }) {
  if (!report) return null;
  return (
    <section className="rounded-lg border border-cyan-900/40 bg-[#0d1117]/70 p-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-sm font-bold tracking-widest text-cyan-300">
          ⬡ FINAL REPORT
        </span>
        {report.loopsUsed > 0 && (
          <span className="ml-auto rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] text-cyan-400">
            {report.loopsUsed} LOOP{report.loopsUsed === 1 ? '' : 'S'} USED
          </span>
        )}
      </div>
      <h2 className="text-lg font-semibold text-[#e6edf3]">{report.title}</h2>
      {report.summary && (
        <p className="mt-3 font-mono text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">
          {report.summary}
        </p>
      )}
      {report.sections.map((section, i) => (
        <div key={i} className="mt-5">
          <h3 className="mb-1.5 border-b border-gray-700/60 pb-1 font-mono text-sm font-bold tracking-wide text-cyan-200">
            {section.title}
          </h3>
          <p className="font-mono text-sm leading-relaxed text-gray-300 whitespace-pre-wrap">
            {section.content}
          </p>
        </div>
      ))}
    </section>
  );
}


/* ------------------------------------------------------------------------- *
 * Main Dashboard
 * ------------------------------------------------------------------------- */

export default function SwarmDashboard() {
  const [topic, setTopic] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Map<string, Task>>(new Map());
  const [alerts, setAlerts] = useState<AlertCard[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const addLog = useCallback((type: string, message: string) => {
    const color = LOG_COLORS[type] ?? 'text-gray-400';
    setLogs((prev) => [...prev, { id: ++idRef.current, time: now(), type, message, color }]);
  }, []);

  const dispatch = useCallback(
    (event: SwarmEvent) => {
      switch (event.type) {
        case 'plan_ready': {
          setPlan(event.plan);
          const map = new Map<string, Task>();
          for (const task of event.plan.tasks) {
            map.set(task.id, { ...task, status: task.status ?? 'pending' });
          }
          setTasks(map);
          setAlerts([]);
          setReport(null);
          addLog('plan_ready', `Spawning ${event.plan.tasks.length} agents from plan.`);
          break;
        }
        case 'task_update': {
          const task = event.task;
          setTasks((prev) => {
            const next = new Map(prev);
            next.set(task.id, task);
            return next;
          });
          const label =
            task.status === 'done'
              ? 'task_done'
              : task.status === 'failed'
              ? 'task_failed'
              : 'task_update';
          const msg =
            task.status === 'done'
              ? `${task.id} complete.`
              : task.status === 'failed'
              ? `${task.id}: ${task.error || 'failed'}`
              : `${task.id} → working on "${task.title}".`;
          addLog(label, msg);
          break;
        }
        case 'gap_detected': {
          const alert: AlertCard = {
            id: ++idRef.current,
            kind: 'gap',
            loopNumber: event.loopNumber,
            reasoning: event.gap.reasoning,
            missing: event.gap.missing ?? [],
            taskIds: [],
          };
          setAlerts((prev) => [...prev, alert]);
          addLog(
            'gap_detected',
            `Gap found at loop ${event.loopNumber}: ${event.gap.reasoning}`
          );
          break;
        }
        case 'redispatch': {
          const alert: AlertCard = {
            id: ++idRef.current,
            kind: 'redispatch',
            loopNumber: event.loopNumber,
            reasoning: '',
            missing: [],
            taskIds: event.taskIds,
          };
          setAlerts((prev) => [...prev, alert]);
          addLog(
            'redispatch',
            `Redispatching ${event.taskIds.length} agent(s): ${event.taskIds.join(', ')}`
          );
          break;
        }
        case 'final_report': {
          setReport(event.report);
          addLog('final_report', `Report complete (${event.report.loopsUsed} loop(s) used).`);
          break;
        }
        case 'error': {
          setError(event.message);
          addLog('error', event.message);
          break;
        }
        case 'agent_thinking':
          addLog('agent_thinking', `${event.taskId}: ${event.status}`);
          break;
        default:
          addLog('system', JSON.stringify(event));
      }
    },
    [addLog]
  );


  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed || running) return;

    setRunning(true);
    setError(null);
    setPlan(null);
    setTasks(new Map());
    setAlerts([]);
    setReport(null);
    setLogs([]);
    idRef.current = 0;
    addLog('system', `Launching swarm on "${trimmed}" (demo provider)…`);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/swarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, provider: 'demo' }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let detail = `Request failed (${res.status})`;
        try {
          const data = await res.json();
          detail = data.error || detail;
        } catch {
          /* not json */
        }
        throw new Error(detail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue; // skips keepalive & blank lines
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              dispatch(JSON.parse(payload) as SwarmEvent);
            } catch {
              addLog('system', 'Could not parse an inbound event.');
            }
          }
        }
      }
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      addLog('error', message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const taskList = Array.from(tasks.values());


  return (
    <div className="min-h-screen w-full bg-[#0a0a0f] text-[#e6edf3]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 animate-pulse">◉</span>
            <h1 className="font-mono text-2xl font-bold tracking-widest text-[#e6edf3]">
              SYNTH-SWARM <span className="text-cyan-400">/ MISSION-CONTROL</span>
            </h1>
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">
            demo provider · live SSE telemetry · autonomous research loop
          </p>
        </header>

        {/* Control deck */}
        <form
          onSubmit={launch}
          className="mb-8 flex flex-col sm:flex-row gap-3 rounded-xl border border-gray-800 bg-[#0d1117]/70 p-4"
        >
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Enter a topic, e.g. ‘AI agents in logistics’"
            className="flex-1 rounded-lg border border-gray-700 bg-black/40 px-3 py-2 font-mono text-sm text-[#e6edf3] placeholder:text-gray-600 focus:border-cyan-500 focus:outline-none"
            disabled={running}
          />
          <button
            type="submit"
            disabled={running || !topic.trim()}
            className="rounded-lg bg-green-600 px-6 py-2 font-mono text-sm font-bold tracking-widest text-black transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? '◌ SWARMING…' : '▶ LAUNCH SWARM'}
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border-l-4 border-red-500 bg-red-500/10 p-3 font-mono text-sm text-red-400">
            ERROR: {error}
          </div>
        )}

        {/* Swarm visual */}
        <div className="mb-6">
          <SwarmVisual tasks={taskList} running={running} />
        </div>

        {/* Planner rationale appears FIRST — the "why" */}
        {plan && (
          <div className="mb-6">
            <PlannerPanel plan={plan} />
          </div>
        )}

        {/* Gap / redispatch alerts — visually distinct, front and center */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-3">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}

        {/* Task grid */}
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-bold tracking-widest text-gray-400">
              ▦ TASK PANELS ({taskList.length})
            </h2>
            <span className="font-mono text-[10px] text-gray-600">grid: 1 / 2 / 3</span>
          </div>
          {taskList.length === 0 ? (
            <p className="rounded-lg border border-gray-800 bg-[#0d1117]/50 p-6 text-center font-mono text-sm text-gray-600">
              Agents spawn here after the planner finishes.
              {running ? ' ◌ planning…' : ' Launch a swarm to begin.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {taskList.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </section>

        {/* Activity log */}
        <section className="mb-8">
          <h2 className="mb-3 font-mono text-sm font-bold tracking-widest text-green-500">
            ▤ ACTIVITY LOG
          </h2>
          <ActivityLog logs={logs} />
        </section>

        {/* Final report */}
        <section>
          <ReportViewer report={report} />
        </section>
      </div>
    </div>
  );
}
