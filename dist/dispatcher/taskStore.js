// src/dispatcher/taskStore.ts
import { randomUUID } from "node:crypto";
export class TaskStore {
    tasks = new Map();
    db;
    constructor(db) {
        this.db = db;
        this.load();
    }
    load() {
        const rows = this.db.prepare("SELECT * FROM tasks").all();
        for (const r of rows) {
            const task = {
                id: r.id,
                agentId: r.agentId,
                input: r.input ? JSON.parse(r.input) : undefined,
                priority: r.priority ?? 0,
                timeoutMs: r.timeoutMs ?? 60000,
                retries: r.retries ?? 0,
                retryDelayMs: r.retryDelayMs ?? 1000,
                dependencies: r.dependencies ? JSON.parse(r.dependencies) : [],
                metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
                status: r.status,
                attempts: r.attempts,
                result: r.result ? JSON.parse(r.result) : undefined,
                createdAt: r.createdAt,
                startedAt: r.startedAt ?? undefined,
                finishedAt: r.finishedAt ?? undefined,
                cancelRequested: !!r.cancelRequested,
            };
            this.tasks.set(task.id, task);
        }
    }
    persist(task) {
        this.db.prepare(`INSERT INTO tasks (id,agentId,input,priority,timeoutMs,retries,retryDelayMs,dependencies,metadata,status,attempts,result,createdAt,startedAt,finishedAt,cancelRequested)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         agentId=excluded.agentId, input=excluded.input, priority=excluded.priority, timeoutMs=excluded.timeoutMs,
         retries=excluded.retries, retryDelayMs=excluded.retryDelayMs, dependencies=excluded.dependencies,
         metadata=excluded.metadata, status=excluded.status, attempts=excluded.attempts, result=excluded.result,
         startedAt=excluded.startedAt, finishedAt=excluded.finishedAt, cancelRequested=excluded.cancelRequested`).run(task.id, task.agentId, task.input !== undefined ? JSON.stringify(task.input) : null, task.priority ?? 0, task.timeoutMs ?? 60000, task.retries ?? 0, task.retryDelayMs ?? 1000, JSON.stringify(task.dependencies ?? []), task.metadata ? JSON.stringify(task.metadata) : null, task.status, task.attempts, task.result ? JSON.stringify(task.result) : null, task.createdAt, task.startedAt ?? null, task.finishedAt ?? null, task.cancelRequested ? 1 : 0);
    }
    create(spec) {
        const id = spec.id ?? randomUUID();
        if (this.tasks.has(id))
            throw new Error(`Task already exists: ${id}`);
        const task = {
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
        this.persist(task);
        return task;
    }
    get(id) {
        return this.tasks.get(id);
    }
    list(filter) {
        let out = [...this.tasks.values()];
        if (filter?.status)
            out = out.filter((t) => t.status === filter.status);
        if (filter?.agentId)
            out = out.filter((t) => t.agentId === filter.agentId);
        return out.sort((a, b) => b.createdAt - a.createdAt);
    }
    update(id, patch) {
        const t = this.tasks.get(id);
        if (!t)
            throw new Error(`Task not found: ${id}`);
        const updated = { ...t, ...patch };
        this.tasks.set(id, updated);
        this.persist(updated);
        return updated;
    }
    delete(id) {
        this.db.prepare("DELETE FROM tasks WHERE id=?").run(id);
        return this.tasks.delete(id);
    }
    clear() {
        this.db.exec("DELETE FROM tasks");
        this.tasks.clear();
    }
    size() {
        return this.tasks.size;
    }
}
//# sourceMappingURL=taskStore.js.map