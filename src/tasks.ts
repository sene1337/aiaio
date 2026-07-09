// Task queue — the central theme. You win by finishing it; amnesia attacks it.

import { Rng } from './rng';
import { GeneratedTask } from './session';

export interface Task {
  name: string;
  workUnits: number;
  progress: number;
  done: boolean;
  /** set true when compaction made the agent forget this task ever existed (renders garbled) */
  forgotten: boolean;
}

export interface TaskQueue {
  tasks: Task[];
  /** index of the task currently being worked */
  current: number;
}

export function makeTaskQueue(generated: GeneratedTask[]): TaskQueue {
  return {
    tasks: generated.map((g) => ({
      name: g.name, workUnits: g.workUnits, progress: 0, done: false, forgotten: false,
    })),
    current: 0,
  };
}

export function totalUnits(q: TaskQueue): number {
  return q.tasks.reduce((s, t) => s + t.workUnits, 0);
}

export function doneUnits(q: TaskQueue): number {
  return q.tasks.reduce((s, t) => s + (t.done ? t.workUnits : t.progress), 0);
}

export function progressFrac(q: TaskQueue): number {
  const total = totalUnits(q);
  return total === 0 ? 1 : doneUnits(q) / total;
}

export function allDone(q: TaskQueue): boolean {
  return q.tasks.every((t) => t.done);
}

/** Advance the current task by one work unit. Returns a status line for the log. */
export function work(q: TaskQueue): string {
  // skip to the next unfinished task if needed
  if (q.current >= q.tasks.length || q.tasks[q.current].done) {
    const next = q.tasks.findIndex((t) => !t.done);
    if (next === -1) return 'task queue already clear';
    q.current = next;
  }
  const t = q.tasks[q.current];
  t.forgotten = false; // working on it un-forgets it
  t.progress += 1;
  if (t.progress >= t.workUnits) {
    t.progress = t.workUnits;
    t.done = true;
    const next = q.tasks.findIndex((x) => !x.done);
    if (next !== -1) q.current = next;
    return `✔ task complete: "${t.name}"`;
  }
  return `working "${t.name}" [${t.progress}/${t.workUnits}]`;
}

/**
 * Compaction amnesia against the queue: rewind progress on the current task
 * and possibly forget which task was being worked (jump to a random one).
 * From the 3rd compaction in a match, cruelty escalates: a COMPLETED task can
 * flip back to needing one re-verify unit ("did I actually ship that?").
 * Returns human-readable lines describing what was lost.
 */
export function amnesia(q: TaskQueue, rng: Rng, severity: number, priorCompactions: number): string[] {
  const lines: string[] = [];
  if (priorCompactions >= 2) {
    const doneTasks = q.tasks.filter((t) => t.done);
    const pUnship = Math.min(0.9, 0.5 + (priorCompactions - 2) * 0.15);
    if (doneTasks.length > 0 && rng.chance(pUnship)) {
      const t = rng.pick(doneTasks);
      t.done = false;
      t.progress = t.workUnits - 1; // one unit of re-verification needed
      t.forgotten = true;
      lines.push(`completed task "${t.name}" un-verified — did we actually ship that?`);
    }
  }
  const t = q.tasks[q.current];
  if (t && !t.done && t.progress > 0) {
    const lost = Math.min(t.progress, Math.max(1, Math.round(severity * 2)));
    t.progress -= lost;
    lines.push(`task "${t.name}" rewound ${lost} unit${lost > 1 ? 's' : ''}`);
  }
  if (rng.chance(0.4 + severity * 0.2)) {
    const candidates = q.tasks.map((x, i) => ({ x, i })).filter(({ x }) => !x.done);
    if (candidates.length > 1) {
      const pickFrom = candidates.filter(({ i }) => i !== q.current);
      const chosen = rng.pick(pickFrom.length ? pickFrom : candidates);
      if (t && !t.done) t.forgotten = true;
      q.current = chosen.i;
      lines.push(`forgot which task it was on — now "${chosen.x.name}"?`);
    }
  }
  return lines;
}

/**
 * Distraction Barrage against the queue: wipe progress on the current task and
 * knock the agent off it. Hardening reduces the wipe.
 */
export function distract(q: TaskQueue, rng: Rng, hardening: number): string[] {
  const lines: string[] = [];
  const t = q.tasks[q.current];
  if (t && !t.done) {
    const wipe = Math.max(0, Math.round((1 + rng.int(0, 1)) * (1 - hardening * 0.6)));
    if (wipe > 0 && t.progress > 0) {
      const lost = Math.min(t.progress, wipe);
      t.progress -= lost;
      lines.push(`"${t.name}" lost ${lost} progress to the distraction`);
    } else {
      lines.push(`"${t.name}" held its progress (hardened agent)`);
    }
    const others = q.tasks.map((x, i) => ({ x, i })).filter(({ x, i }) => !x.done && i !== q.current);
    if (others.length > 0 && rng.chance(0.85 - hardening * 0.4)) {
      const chosen = rng.pick(others);
      q.current = chosen.i;
      lines.push(`agent wandered off to "${chosen.x.name}"`);
    }
  } else {
    lines.push('distraction fizzled — no active task to derail');
  }
  return lines;
}
