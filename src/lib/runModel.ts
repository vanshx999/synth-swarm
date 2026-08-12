import type { SwarmEvent, Task, Plan, Report } from '@/lib/types';

/** Derive a displayable run model from an ordered list of SSE events. */
export interface RunModel {
  topic?: string;
  plan: Plan | null;
  tasks: Task[];
  report: Report | null;
  gaps: { reasoning: string; missing: string[]; loopNumber: number; at: number }[];
  error?: string;
  running: boolean;
  startedAt: number;
  lastEventAt: number;
}

export function emptyRun(): RunModel {
  return {
    plan: null,
    tasks: [],
    report: null,
    gaps: [],
    running: false,
    startedAt: 0,
    lastEventAt: 0,
  };
}

export function applyEvent(run: RunModel, evt: SwarmEvent, at: number): RunModel {
  const next: RunModel = {
    ...run,
    lastEventAt: at,
  };

  switch (evt.type) {
    case 'plan_ready':
      next.plan = evt.plan;
      next.tasks = evt.plan.tasks.map((t) => ({ ...t }));
      break;

    case 'task_update': {
      const idx = next.tasks.findIndex((t) => t.id === evt.task.id);
      if (idx >= 0) {
        next.tasks = [...next.tasks];
        next.tasks[idx] = { ...evt.task };
      } else {
        next.tasks = [...next.tasks, { ...evt.task }];
      }
      break;
    }

    case 'gap_detected':
      next.gaps = [
        ...next.gaps,
        {
          reasoning: evt.gap.reasoning,
          missing: evt.gap.missing || [],
          loopNumber: evt.loopNumber,
          at,
        },
      ];
      break;

    case 'redispatch':
      next.tasks = next.tasks.map((t) =>
        evt.taskIds.includes(t.id) ? { ...t, status: 'working' as const } : t
      );
      break;

    case 'final_report':
      next.report = evt.report;
      next.running = false;
      break;

    case 'error':
      next.error = evt.message;
      next.running = false;
      break;

    default:
      break;
  }

  return next;
}

/** Short preview text for a run, drawn from the report or first done task. */
export function runPreview(run: RunModel): string {
  if (run.report?.summary) return run.report.summary;
  const done = run.tasks.find((t) => t.status === 'done' && t.result);
  if (done?.result) return done.result.slice(0, 140);
  if (run.error) return `Error: ${run.error}`;
  return 'In progress…';
}