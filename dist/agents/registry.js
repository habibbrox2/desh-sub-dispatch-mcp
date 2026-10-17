// src/agents/registry.ts
import { randomUUID } from "node:crypto";
export class AgentRegistry {
    agents = new Map();
    db;
    constructor(db) {
        this.db = db;
        this.load();
    }
    load() {
        const rows = this.db.prepare("SELECT * FROM agents").all();
        for (const r of rows) {
            const agent = {
                id: r.id,
                name: r.name,
                description: r.description ?? undefined,
                config: JSON.parse(r.config),
                concurrency: r.concurrency ?? 1,
                tags: r.tags ? JSON.parse(r.tags) : undefined,
                createdAt: r.createdAt,
            };
            this.agents.set(agent.id, agent);
        }
    }
    register(input) {
        const id = input.id ?? randomUUID();
        if (this.agents.has(id))
            throw new Error(`Agent already exists: ${id}`);
        const agent = {
            id,
            name: input.name,
            description: input.description,
            config: input.config,
            concurrency: input.concurrency ?? 1,
            tags: input.tags,
            createdAt: Date.now(),
        };
        this.db.prepare("INSERT INTO agents (id,name,description,config,concurrency,tags,createdAt) VALUES (?,?,?,?,?,?,?)").run(agent.id, agent.name, agent.description ?? null, JSON.stringify(agent.config), agent.concurrency ?? 1, agent.tags ? JSON.stringify(agent.tags) : null, agent.createdAt);
        this.agents.set(id, agent);
        return agent;
    }
    unregister(id) {
        this.db.prepare("DELETE FROM agents WHERE id=?").run(id);
        return this.agents.delete(id);
    }
    get(id) {
        return this.agents.get(id);
    }
    list(filter) {
        let out = [...this.agents.values()];
        if (filter?.kind)
            out = out.filter((a) => a.config.kind === filter.kind);
        if (filter?.tag)
            out = out.filter((a) => a.tags?.includes(filter.tag));
        return out;
    }
    update(id, patch) {
        const a = this.agents.get(id);
        if (!a)
            throw new Error(`Agent not found: ${id}`);
        const updated = { ...a, ...patch, config: patch.config ?? a.config };
        this.db.prepare("UPDATE agents SET name=?,description=?,config=?,concurrency=?,tags=? WHERE id=?").run(updated.name, updated.description ?? null, JSON.stringify(updated.config), updated.concurrency ?? 1, updated.tags ? JSON.stringify(updated.tags) : null, id);
        this.agents.set(id, updated);
        return updated;
    }
}
//# sourceMappingURL=registry.js.map