import { randomUUID } from "node:crypto";
import type { Agent, AgentConfig } from "../types.js";

export class AgentRegistry {
  private agents = new Map<string, Agent>();

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
    this.agents.set(id, agent);
    return agent;
  }

  unregister(id: string): boolean {
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
    this.agents.set(id, updated);
    return updated;
  }
}