import { AgentRegistry } from "../agents/registry.js";
import { TaskStore } from "./taskStore.js";
import { executeAgent } from "./executor.js";
import { SkillRegistry } from "../skills/registry.js";
import { openDatabase } from "../persistence/database.js";
import type { Task, TaskSpec, TaskStatus, TaskResult } from "../types.js";

export interface DispatcherOptions {
  maxConcurrency?: number;
  defaultTimeoutMs?: number;
}

export class Dispatcher {
  registry: AgentRegistry;
  store: TaskStore;
  skills: SkillRegistry;
  db: any;
  private maxConcurrency: number;
  private active = 0;
  private agentActive = new Map<string, number>();
  private controllers = new Map<string, AbortController>();
  private retryTimers = new Map<string, NodeJS.Timeout>();
  private listeners = new Set<(task: Task) => void>();

  constructor(opts: DispatcherOptions & { dbPath?: string } = {}) {
    this.db = openDatabase(opts.dbPath);
    this.registry = new AgentRegistry(this.db);
    this.store = new TaskStore(this.db);
    this.skills = new SkillRegistry();
    this.maxConcurrency = opts.maxConcurrency ?? 4;
  }

  /** Public snapshot of dispatcher state (used by get_dispatcher_stats). */
  getStats(): { maxConcurrency: number; active: number; tasks: number; agents: number } {
    return {
      maxConcurrency: this.maxConcurrency,
      active: this.active,
      tasks: this.store.size(),
      agents: this.registry.list().length,
    };
  }

  onTaskChange(cb: (task: Task) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(task: Task) {
    for (const cb of this.listeners) {
      try { cb(task); } catch {}
    }
  }

  submit(spec: TaskSpec): Task {
    const task = this.store.create(spec);
    this.emit(task);
    setImmediate(() => this.tick());
    return task;
  }

  submitMany(specs: TaskSpec[]): Task[] {
    return specs.map((s) => this.submit(s));
  }

  cancel(taskId: string): Task {
    const t = this.store.get(taskId);
    if (!t) throw new Error(`Task not found: ${taskId}`);
    if (t.status === "succeeded" || t.status === "failed" || t.status === "cancelled") {
      return t;
    }
    this.store.update(taskId, { cancelRequested: true } as any);
    const ctrl = this.controllers.get(taskId);
    if (ctrl) ctrl.abort();
    const timer = this.retryTimers.get(taskId);
    if (timer) { clearTimeout(timer); this.retryTimers.delete(taskId); }
    const updated = this.store.update(taskId, { status: "cancelled", finishedAt: Date.now() });
    this.emit(updated);
    this.tick();
    return updated;
  }

  retry(taskId: string): Task {
    const t = this.store.get(taskId);
    if (!t) throw new Error(`Task not found: ${taskId}`);
    if (t.status === "running") throw new Error("Cannot retry running task");
    const updated = this.store.update(taskId, {
      status: "pending",
      attempts: 0,
      result: undefined,
      startedAt: undefined,
      finishedAt: undefined,
      cancelRequested: false,
    } as any);
    this.emit(updated);
    setImmediate(() => this.tick());
    return updated;
  }

  private tick() {
    const tasks = this.store.list();
    for (const t of tasks) {
      if (t.status !== "pending" && t.status !== "retrying") continue;
      if (t.runAt && t.runAt > Date.now()) continue;
      if (t.cancelRequested) {
        this.store.update(t.id, { status: "cancelled", finishedAt: Date.now() });
        this.emit(this.store.get(t.id)!);
        continue;
      }
      let depFailed = false;
      let depsReady = true;
      for (const depId of t.dependencies ?? []) {
        const dep = this.store.get(depId);
        if (!dep) { depFailed = true; break; }
        if (dep.status === "failed" || dep.status === "cancelled") { depFailed = true; break; }
        if (dep.status !== "succeeded") { depsReady = false; break; }
      }
      if (depFailed) {
        const r: TaskResult = {
          taskId: t.id,
          agentId: t.agentId,
          status: "failed",
          error: "Dependency failed",
          attempts: t.attempts,
          finishedAt: Date.now(),
        };
        const updated = this.store.update(t.id, { status: "failed", finishedAt: Date.now(), result: r });
        this.emit(updated);
        continue;
      }
      if (!depsReady) continue;
      if (t.status === "pending") {
        const u = this.store.update(t.id, { status: "queued" });
        this.emit(u);
      }
    }

    const queued = this.store.list({ status: "queued" })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);

    for (const t of queued) {
      if (this.active >= this.maxConcurrency) break;
      const agent = this.registry.get(t.agentId);
      if (!agent) {
        const r: TaskResult = { taskId: t.id, agentId: t.agentId, status: "failed", error: "Agent not found", attempts: t.attempts, finishedAt: Date.now() };
        const updated = this.store.update(t.id, { status: "failed", finishedAt: Date.now(), result: r });
        this.emit(updated);
        continue;
      }
      const aActive = this.agentActive.get(t.agentId) ?? 0;
      if (aActive >= (agent.concurrency ?? 1)) continue;
      this.runTask(t.id, agent);
    }
  }

  private async runTask(taskId: string, agent: any) {
    const t = this.store.get(taskId)!;
    this.active++;
    this.agentActive.set(agent.id, (this.agentActive.get(agent.id) ?? 0) + 1);
    const ctrl = new AbortController();
    this.controllers.set(taskId, ctrl);
    const startedAt = Date.now();
    this.store.update(taskId, { status: "running", startedAt, attempts: t.attempts + 1 });
    const running = this.store.get(taskId)!;
    this.emit(running);

    const timeoutMs = running.timeoutMs ?? 60000;
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let attempts = running.attempts;

    try {
      const output = await executeAgent(agent, running.input, { signal: ctrl.signal, timeoutMs });
      clearTimeout(timer);
      if (ctrl.signal.aborted) throw new Error("Aborted");
      const finishedAt = Date.now();
      const result: TaskResult = {
        taskId,
        agentId: agent.id,
        status: "succeeded",
        output,
        startedAt,
        finishedAt,
        attempts,
        durationMs: finishedAt - startedAt,
      };
      const updated = this.store.update(taskId, { status: "succeeded", finishedAt, result });
      this.emit(updated);
      this.sendWebhook(updated);
    } catch (e: any) {
      clearTimeout(timer);
      const errMsg = e?.message ?? String(e);
      const task = this.store.get(taskId)!;
      const canRetry = !task.cancelRequested && (task.attempts - 1) < (task.retries ?? 0);
      if (canRetry) {
        const delay = task.retryDelayMs ?? 1000;
        this.store.update(taskId, { status: "retrying" });
        this.emit(this.store.get(taskId)!);
        const timer2 = setTimeout(() => {
          this.retryTimers.delete(taskId);
          const cur = this.store.get(taskId);
          if (!cur || cur.cancelRequested) return;
          this.store.update(taskId, { status: "pending" });
          this.emit(this.store.get(taskId)!);
          this.tick();
        }, delay);
        this.retryTimers.set(taskId, timer2);
      } else {
        const finishedAt = Date.now();
        const finalStatus: TaskStatus = task.cancelRequested ? "cancelled" : "failed";
        const result: TaskResult = {
          taskId,
          agentId: agent.id,
          status: finalStatus,
          error: errMsg,
          startedAt,
          finishedAt,
          attempts,
          durationMs: finishedAt - startedAt,
        };
        const updated = this.store.update(taskId, { status: finalStatus, finishedAt, result });
        this.emit(updated);
        this.sendWebhook(updated);
      }
    } finally {
      this.controllers.delete(taskId);
      this.active = Math.max(0, this.active - 1);
      this.agentActive.set(agent.id, Math.max(0, (this.agentActive.get(agent.id) ?? 1) - 1));
      setImmediate(() => this.tick());
    }
  }

  runWorkflow(tasks: { key: string; spec: any }[]): Record<string, string> {
    const keyToId: Record<string, string> = {};
    const created: { key: string; id: string; dependsOn?: string[] }[] = [];
    for (const t of tasks) {
      const task = this.store.create({ ...t.spec, dependencies: [] });
      keyToId[t.key] = task.id;
      created.push({ key: t.key, id: task.id, dependsOn: t.spec.dependsOn });
    }
    for (const c of created) {
      const depIds = (c.dependsOn ?? []).map((k: string) => keyToId[k]).filter(Boolean);
      this.store.update(c.id, { dependencies: depIds });
    }
    for (const c of created) this.emit(this.store.get(c.id)!);
    setImmediate(() => this.tick());
    return keyToId;
  }

  private sendWebhook(task: Task) {
    const url = (task.metadata as any)?.webhookUrl;
    if (!url) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task.result ?? { status: task.status }),
    }).catch(() => {});
  }

  getStatus(taskId: string): Task | undefined {
    return this.store.get(taskId);
  }

  getResult(taskId: string): TaskResult | undefined {
    return this.store.get(taskId)?.result;
  }
}