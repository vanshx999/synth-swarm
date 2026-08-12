'use client';

import type { RunModel } from '@/lib/runModel';

interface ResourcesViewProps {
  run: RunModel | null;
}

export function ResourcesView({ run }: ResourcesViewProps) {
  if (!run) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h3 className="text-lg font-semibold">No sources yet</h3>
        <p className="text-sm text-muted mt-1 max-w-sm">
          Run a research swarm — every source each agent cites will be listed
          here, grouped by the task that used it.
        </p>
      </div>
    );
  }

  const tasksWithSources = run.tasks.filter((t) => t.sources && t.sources.length > 0);

  if (tasksWithSources.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="text-5xl mb-4">🔗</div>
        <h3 className="text-lg font-semibold">No sources captured</h3>
        <p className="text-sm text-muted mt-1 max-w-sm">
          The current run did not capture any sources. Start a fresh run and
          the agents&apos; Tavily results will appear here.
        </p>
      </div>
    );
  }

  // Count unique URLs across the whole run
  const uniqueUrls = new Set<string>();
  tasksWithSources.forEach((t) =>
    t.sources!.forEach((s) => s.url && uniqueUrls.add(s.url))
  );

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-gradient-to-r from-cyan-500 to-fuchsia-500" />
            Resources
          </h2>
          <p className="text-xs text-muted mt-0.5 truncate">
            {uniqueUrls.size} unique source{uniqueUrls.size === 1 ? '' : 's'} ·{' '}
            {tasksWithSources.length} agent{tasksWithSources.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="font-mono text-[10px] text-muted bg-surface/70 rounded-full px-3 py-1 border border-black/5 dark:border-white/10">
          {run.topic || 'research swarm'}
        </div>
      </div>

      <div className="custom-scroll flex-1 overflow-y-auto space-y-4 min-h-0 pr-0.5">
        {tasksWithSources.map((task) => (
          <div
            key={task.id}
            className="rounded-2xl border border-black/5 dark:border-white/10 bg-surface/60 backdrop-blur p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                {task.id}
              </span>
              <h3 className="text-sm font-semibold text-ink truncate">{task.title}</h3>
              <span className="ml-auto text-[10px] font-mono text-muted">
                {task.sources!.length}
              </span>
            </div>
            <ul className="space-y-2">
              {task.sources!.map((src, i) => (
                <li
                  key={`${src.url}-${i}`}
                  className="flex flex-col sm:flex-row sm:items-start gap-1 rounded-xl border border-black/5 dark:border-white/10 bg-surface p-3"
                >
                  <div className="flex-1 min-w-0">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-ink hover:text-violet-500 transition-colors break-words"
                    >
                      {src.title}
                    </a>
                    <div className="text-[11px] font-mono text-muted mt-0.5 truncate">
                      {src.url}
                    </div>
                  </div>
                  <p className="text-xs text-muted leading-snug sm:max-w-[50%] line-clamp-3">
                    {src.snippet}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
