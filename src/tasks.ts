/**
 * Background task scheduling. Ports the `ra.common.tasks` package.
 *
 * The Java version drove thread pools from a 30-second poll loop. This port
 * keeps a poll loop on `setInterval` and runs each task as an async chain: a
 * task whose `periodicityMs` is `-1` is skipped; `0` runs once; `> 0` re-runs on
 * a fixed delay.
 */

export enum TaskStatus {
  Ready = "Ready",
  Running = "Running",
  Completed = "Completed",
}

export interface TaskConfig {
  name: string;
  periodicityMs: number;
  delayed: boolean;
  delayMs: number;
  fixedDelay: boolean;
  longRunning: boolean;
}

export function taskConfigOnce(name: string): TaskConfig {
  return { name, periodicityMs: 0, delayed: false, delayMs: 0, fixedDelay: false, longRunning: false };
}

export function taskConfigPeriodic(name: string, periodMs: number): TaskConfig {
  return { ...taskConfigOnce(name), periodicityMs: periodMs };
}

export interface Task {
  config(): TaskConfig;
  execute(): boolean | Promise<boolean>;
  shouldStop?(): boolean;
  onStop?(): void;
}

export enum RunnerStatus {
  Running = "Running",
  Stopping = "Stopping",
  Shutdown = "Shutdown",
}

interface Managed {
  task: Task;
  status: TaskStatus;
  stop: boolean;
  scheduled: boolean;
  done: Promise<void> | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Schedules and runs {@link Task} objects. */
export class TaskRunner {
  private tasks: Managed[] = [];
  private running = false;
  private pollMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(pollPeriodMs = 30_000) {
    this.pollMs = Math.max(1, pollPeriodMs);
  }

  setPollPeriodMs(ms: number): void {
    this.pollMs = Math.max(1, ms);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.pass(), this.pollMs);
    }
  }

  addTask(task: Task): void {
    this.tasks.push({ task, status: TaskStatus.Ready, stop: false, scheduled: false, done: null });
    if (this.running) this.pass();
  }

  poke(): void {
    if (this.running) this.pass();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.pass(), this.pollMs);
    this.pass();
  }

  status(): RunnerStatus {
    if (!this.running && this.timer === null) return RunnerStatus.Shutdown;
    return this.running ? RunnerStatus.Running : RunnerStatus.Stopping;
  }

  taskCount(): number {
    return this.tasks.length;
  }

  async shutdown(): Promise<void> {
    this.running = false;
    for (const m of this.tasks) m.stop = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await Promise.all(this.tasks.map((m) => m.done).filter((p): p is Promise<void> => p !== null));
    this.tasks = [];
  }

  private pass(): void {
    this.tasks = this.tasks.filter((m) => m.status !== TaskStatus.Completed);
    for (const m of this.tasks) {
      if (m.scheduled) continue;
      const cfg = m.task.config();
      if (cfg.periodicityMs === -1) continue;
      m.scheduled = true;
      m.done = this.worker(m, cfg);
    }
  }

  private async worker(m: Managed, cfg: TaskConfig): Promise<void> {
    if (cfg.delayed && cfg.delayMs > 0) await sleep(cfg.delayMs);
    for (;;) {
      if (m.stop || (m.task.shouldStop?.() ?? false)) {
        m.task.onStop?.();
        break;
      }
      m.status = TaskStatus.Running;
      await m.task.execute();
      if (cfg.periodicityMs <= 0) break;
      m.status = TaskStatus.Ready;
      await sleep(cfg.periodicityMs);
    }
    m.status = TaskStatus.Completed;
  }
}
