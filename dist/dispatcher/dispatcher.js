import { AgentRegistry } from "../agents/registry.js";
import { TaskStore } from "./taskStore.js";
import { executeAgent } from "./executor.js";
import { SkillRegistry } from "../skills/registry.js";
import { openDatabase } from "../persistence/database.js";
export class Dispatcher {
    registry;
    store;
    skills;
    db;
    maxConcurrency;
    active = 0;
    agentActive = new Map();
    controllers = new Map();
    retryTimers = new Map();
    listeners = new Set();
    constructor(opts = {}) {
        this.db = openDatabase(opts.dbPath);
        this.registry = new AgentRegistry(this.db);
        this.store = new TaskStore(this.db);
        this.skills = new SkillRegistry();
        this.maxConcurrency = opts.maxConcurrency ?? 4;
    }
    onTaskChange(cb) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }
    emit(task) {
        for (const cb of this.listeners) {
            try {
                cb(task);
            }
            catch { }
        }
    }
    submit(spec) {
        const task = this.store.create(spec);
        this.emit(task);
        setImmediate(() => this.tick());
        return task;
    }
    submitMany(specs) {
        return specs.map((s) => this.submit(s));
    }
    cancel(taskId) {
        const t = this.store.get(taskId);
        if (!t)
            throw new Error(`Task not found: ${taskId}`);
        if (t.status === "succeeded" || t.status === "failed" || t.status === "cancelled") {
            return t;
        }
        this.store.update(taskId, { cancelRequested: true });
        const ctrl = this.controllers.get(taskId);
        if (ctrl)
            ctrl.abort();
        const timer = this.retryTimers.get(taskId);
        if (timer) {
            clearTimeout(timer);
            this.retryTimers.delete(taskId);
        }
        const updated = this.store.update(taskId, { status: "cancelled", finishedAt: Date.now() });
        this.emit(updated);
        this.tick();
        return updated;
    }
    retry(taskId) {
        const t = this.store.get(taskId);
        if (!t)
            throw new Error(`Task not found: ${taskId}`);
        if (t.status === "running")
            throw new Error("Cannot retry running task");
        const updated = this.store.update(taskId, {
            status: "pending",
            attempts: 0,
            result: undefined,
            startedAt: undefined,
            finishedAt: undefined,
            cancelRequested: false,
        });
        this.emit(updated);
        setImmediate(() => this.tick());
        return updated;
    }
    tick() {
        const tasks = this.store.list();
        for (const t of tasks) {
            if (t.status !== "pending" && t.status !== "retrying")
                continue;
            if (t.cancelRequested) {
                this.store.update(t.id, { status: "cancelled", finishedAt: Date.now() });
                this.emit(this.store.get(t.id));
                continue;
            }
            let depFailed = false;
            let depsReady = true;
            for (const depId of t.dependencies ?? []) {
                const dep = this.store.get(depId);
                if (!dep) {
                    depFailed = true;
                    break;
                }
                if (dep.status === "failed" || dep.status === "cancelled") {
                    depFailed = true;
                    break;
                }
                if (dep.status !== "succeeded") {
                    depsReady = false;
                    break;
                }
            }
            if (depFailed) {
                const r = {
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
            if (!depsReady)
                continue;
            if (t.status === "pending") {
                const u = this.store.update(t.id, { status: "queued" });
                this.emit(u);
            }
        }
        const queued = this.store.list({ status: "queued" })
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdAt - b.createdAt);
        for (const t of queued) {
            if (this.active >= this.maxConcurrency)
                break;
            const agent = this.registry.get(t.agentId);
            if (!agent) {
                const r = { taskId: t.id, agentId: t.agentId, status: "failed", error: "Agent not found", attempts: t.attempts, finishedAt: Date.now() };
                const updated = this.store.update(t.id, { status: "failed", finishedAt: Date.now(), result: r });
                this.emit(updated);
                continue;
            }
            const aActive = this.agentActive.get(t.agentId) ?? 0;
            if (aActive >= (agent.concurrency ?? 1))
                continue;
            this.runTask(t.id, agent);
        }
    }
    async runTask(taskId, agent) {
        const t = this.store.get(taskId);
        this.active++;
        this.agentActive.set(agent.id, (this.agentActive.get(agent.id) ?? 0) + 1);
        const ctrl = new AbortController();
        this.controllers.set(taskId, ctrl);
        const startedAt = Date.now();
        this.store.update(taskId, { status: "running", startedAt, attempts: t.attempts + 1 });
        const running = this.store.get(taskId);
        this.emit(running);
        const timeoutMs = running.timeoutMs ?? 60000;
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let attempts = running.attempts;
        try {
            const output = await executeAgent(agent, running.input, { signal: ctrl.signal, timeoutMs });
            clearTimeout(timer);
            if (ctrl.signal.aborted)
                throw new Error("Aborted");
            const finishedAt = Date.now();
            const result = {
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
        }
        catch (e) {
            clearTimeout(timer);
            const errMsg = e?.message ?? String(e);
            const task = this.store.get(taskId);
            const canRetry = !task.cancelRequested && (task.attempts - 1) < (task.retries ?? 0);
            if (canRetry) {
                const delay = task.retryDelayMs ?? 1000;
                this.store.update(taskId, { status: "retrying" });
                this.emit(this.store.get(taskId));
                const timer2 = setTimeout(() => {
                    this.retryTimers.delete(taskId);
                    const cur = this.store.get(taskId);
                    if (!cur || cur.cancelRequested)
                        return;
                    this.store.update(taskId, { status: "pending" });
                    this.emit(this.store.get(taskId));
                    this.tick();
                }, delay);
                this.retryTimers.set(taskId, timer2);
            }
            else {
                const finishedAt = Date.now();
                const finalStatus = task.cancelRequested ? "cancelled" : "failed";
                const result = {
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
            }
        }
        finally {
            this.controllers.delete(taskId);
            this.active = Math.max(0, this.active - 1);
            this.agentActive.set(agent.id, Math.max(0, (this.agentActive.get(agent.id) ?? 1) - 1));
            setImmediate(() => this.tick());
        }
    }
    runWorkflow(tasks) {
        const keyToId = {};
        const created = [];
        for (const t of tasks) {
            const task = this.store.create({ ...t.spec, dependencies: [] });
            keyToId[t.key] = task.id;
            created.push({ key: t.key, id: task.id, dependsOn: t.spec.dependsOn });
        }
        for (const c of created) {
            const depIds = (c.dependsOn ?? []).map((k) => keyToId[k]).filter(Boolean);
            this.store.update(c.id, { dependencies: depIds });
        }
        for (const c of created)
            this.emit(this.store.get(c.id));
        setImmediate(() => this.tick());
        return keyToId;
    }
    getStatus(taskId) {
        return this.store.get(taskId);
    }
    getResult(taskId) {
        return this.store.get(taskId)?.result;
    }
}
//# sourceMappingURL=dispatcher.js.map