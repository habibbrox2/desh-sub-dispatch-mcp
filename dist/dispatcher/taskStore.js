import { randomUUID } from "node:crypto";
export class TaskStore {
    tasks = new Map();
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
        return updated;
    }
    delete(id) {
        return this.tasks.delete(id);
    }
    clear() {
        this.tasks.clear();
    }
    size() {
        return this.tasks.size;
    }
}
//# sourceMappingURL=taskStore.js.map