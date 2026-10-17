import { randomUUID } from "node:crypto";
import type { Task, TaskResult, TaskSpec, TaskStatus } from "../types.js";

export class TaskStore {
  private tasks = new Map<string, Task>();

  create(spec: TaskSpec): Task {
    const id = spec.id ?? randomUUID();
    if (this.tasks.has(id)) throw new Error(`Task already exists: ${id}`);
    const task: Task = {
      ...spec,
      id,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
      priority: spec.priority ?? 0,
      retries: spec.retries ?? 0,
      retryDelayMs: spec.retryDelayMs ?? 1000,
      timeoutMs: spec.timeoutMs ?? 60000,
      dependencies: spec.dependencies ?? [],
    };
    this.tasks.set(id, task);
    return task;
  }

  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  list(filter?: { status?: TaskStatus; agentId?: string }): Task[] {
    let out = [...this.tasks.values()];
    if (filter?.status) out = out.filter((t) => t.status === filter.status);
    if (filter?.agentId) out = out.filter((t) => t.agentId === filter.agentId);
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  update(id: string, patch: Partial<Task>): Task {
    const t = this.tasks.get(id);
    if (!t) throw new Error(`Task not found: ${id}`);
    const updated = { ...t, ...patch };
    this.tasks.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.tasks.delete(id);
  }

  clear(): void {
    this.tasks.clear();
  }

  size(): number {
    return this.tasks.size;
  }
}