// src/skills/types.ts
import type { AgentConfig } from "../types.js";

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  agentConfig: AgentConfig;
}