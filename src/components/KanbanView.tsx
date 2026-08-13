'use client';

import type { RunModel } from '@/lib/runModel';
import { displayTitle } from '@/lib/topic';

interface KanbanViewProps {
  run: RunModel | null;
}

const COLUMNS = [
  { key: 'pending', label: 'Queued', accent: 'text-muted', dot: 'bg-slate-400', ring: 'border-slate-300 dark:border-slate-600' },
  { key: 'working', label: 'In Progress', accent: 'text-cyan-600', dot: 'bg-cyan-500', ring: 'border-cyan-400' },
  { key: 'done', label: 'Complete', accent: 'text-emerald-600', dot: 'bg-emerald-500', ring: 'border-emerald-400' },
  { key: 'failed', label: 'Failed', accent: 'text-rose-600', dot: 'bg-rose-500', ring: 'border-rose-400' },
] as const;

type StatusKey = (typeof COLUMNS)[number]['key'];

const CARD_STYLES: Record<
  StatusKey,
  { border: string; head: string; badge: string }
> = {
  pending: { border: 'border-slate-200 dark:border-slate-600', head: 'text-muted', badge: 'bg-slate-100 dark:bg-slate-700 text-muted' },
  working: {
    border: 'border-cyan-300 dark:border-cyan-500/60',
    head: 'text-cyan-700',
    badge: 'bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300',
  },
  done: {
    border: 'border-emerald-300 dark:border-emerald-500/60',
    head: 'text-emerald-700',
    badge: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300',
  },
  failed: {
    border: 'border-rose-300 dark:border-rose-500/60',
    head: 'text-rose-700',
    badge: 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300',
  },
};

export function KanbanView({ run }: KanbanViewProps) {
  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="text-5xl mb-4">🗂</div>
        <h3 className="text-lg font-semibold">No swarm to display yet</h3>
        <p className="text-sm text-muted mt-1 max-w-sm">
          Run a research swarm from the chat view — its agents will appear here
          on the board in real time.
        </p>
      </div>
    );
  }

  const tasks = run.tasks;
  const columns = COLUMNS.map((col) => ({
    ...col,
    items: tasks.filter((t) => t.status === col.key),
  }));
  const total = tasks.length || 1;

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
      {/* Board header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-cyan-500 to-fuchsia-500" />
            Swarm Kanban
          </h2>
          <p className="text-xs text-muted mt-0.5 truncate">
            {run.topic || 'research swarm'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {columns.map((c) => (
            <div key={c.key} className="flex items-center gap-1 font-mono text-[10px] text-muted bg-surface/70 rounded-full px-2.5 py-1 border border-black/5 dark:border-white/10">
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
              {c.label} <span className="font-bold text-ink">{c.items.length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden flex">
        {columns
          .filter((c) => c.items.length > 0)
          .map((c, i) => (
            <div
              key={i}
              className={c.dot}
              style={{ width: `${(c.items.length / total) * 100}%` }}
            />
          ))}
      </div>

      {/* Columns */}
      <div className="flex-1 grid grid-cols-2 xl:grid-cols-4 gap-3 min-h-0">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`rounded-2xl border ${col.ring} bg-surface/60 backdrop-blur p-3 flex flex-col min-h-0 ${
              col.key === 'working' ? 'ring-2 ring-cyan-500/10' : ''
            }`}
          >
            <div className={`flex items-center gap-2 px-1 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] ${col.accent}`}>
              <span className={`w-2 h-2 rounded-full ${col.dot} ${col.key === 'working' ? 'animate-pulse' : ''}`} />
              {col.label}
              <span className="ml-auto text-muted">{col.items.length}</span>
            </div>

            <div className="custom-scroll flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-0">
              {col.items.map((t, i) => {
                const style = CARD_STYLES[col.key];
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl border ${style.border} bg-surface p-3 transition-all duration-300 hover:shadow-[0_4px_16px_rgba(139,92,246,0.12),0_0_0_1px_rgba(139,92,246,0.35)] hover:-translate-y-0.5 ${
                      col.key === 'working' ? 'animate-think' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono text-[9px] uppercase tracking-wider ${style.head}`}>
                        A{String(i + 1).padStart(2, '0')}
                      </span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${style.badge}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className={`mt-1.5 text-[13px] leading-snug font-medium ${style.head}`}>
                      {displayTitle(t.title)}
                    </div>
                    {t.status === 'working' && t.thinking && (
                      <div className="mt-1.5 font-mono text-[10px] text-cyan-600 animate-think">{t.thinking}</div>
                    )}
                    {(t.status === 'done' && t.result) || (t.status === 'failed' && t.error) ? (
                      <div className="mt-1.5 text-[11px] leading-snug text-muted line-clamp-3 whitespace-pre-wrap">
                        {t.status === 'failed' ? t.error : t.result}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {col.items.length === 0 && (
                <div className="h-20 rounded-xl border border-dashed border-black/10 dark:border-white/10 flex items-center justify-center text-[11px] text-muted">
                  empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
