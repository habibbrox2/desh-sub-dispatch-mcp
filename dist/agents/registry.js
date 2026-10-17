import { randomUUID } from "node:crypto";
export class AgentRegistry {
    agents = new Map();
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
        this.agents.set(id, agent);
        return agent;
    }
    unregister(id) {
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
        this.agents.set(id, updated);
        return updated;
    }
}
//# sourceMappingURL=registry.js.map