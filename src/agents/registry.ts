// src/agents/registry.ts
import { randomUUID } from "node:crypto";
import type { Agent, AgentConfig } from "../types.js";
import type { DatabaseSync } from "node:sqlite";

export class AgentRegistry {
  private agents = new Map<string, Agent>();
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.load();
  }

  private load() {
    const rows = this.db.prepare("SELECT * FROM agents").all() as any[];
    for (const r of rows) {
      const agent: Agent = {
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

  register(input: {
    id?: string;
    name: string;
    description?: string;
    config: AgentConfig;
    concurrency?: number;
    tags?: string[];
  }): Agent {
    const id = input.id ?? randomUUID();
    if (this.agents.has(id)) throw new Error(`Agent already exists: ${id}`);
    const agent: Agent = {
      id,
      name: input.name,
      description: input.description,
      config: input.config,
      concurrency: input.concurrency ?? 1,
      tags: input.tags,
      createdAt: Date.now(),
    };
    this.db.prepare(
      "INSERT INTO agents (id,name,description,config,concurrency,tags,createdAt) VALUES (?,?,?,?,?,?,?)"
    ).run(agent.id, agent.name, agent.description ?? null, JSON.stringify(agent.config), agent.concurrency ?? 1, agent.tags ? JSON.stringify(agent.tags) : null, agent.createdAt);
    this.agents.set(id, agent);
    return agent;
  }

  unregister(id: string): boolean {
    this.db.prepare("DELETE FROM agents WHERE id=?").run(id);
    return this.agents.delete(id);
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  list(filter?: { kind?: string; tag?: string }): Agent[] {
    let out = [...this.agents.values()];
    if (filter?.kind) out = out.filter((a) => a.config.kind === filter.kind);
    if (filter?.tag) out = out.filter((a) => a.tags?.includes(filter.tag!));
    return out;
  }

  update(id: string, patch: Partial<Omit<Agent, "id" | "createdAt">>): Agent {
    const a = this.agents.get(id);
    if (!a) throw new Error(`Agent not found: ${id}`);
    const updated: Agent = { ...a, ...patch, config: patch.config ?? a.config };
    this.db.prepare(
      "UPDATE agents SET name=?,description=?,config=?,concurrency=?,tags=? WHERE id=?"
    ).run(updated.name, updated.description ?? null, JSON.stringify(updated.config), updated.concurrency ?? 1, updated.tags ? JSON.stringify(updated.tags) : null, id);
    this.agents.set(id, updated);
    return updated;
  }
}
