export type AgentKind = "llm" | "process" | "http";

export interface LlmAgentConfig {
  kind: "llm";
  provider: "openai" | "anthropic" | "generic" | "gemini" | "ollama" | "mistral" | "cohere";
  apiKey?: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProcessAgentConfig {
  kind: "process";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
}

export interface HttpAgentConfig {
  kind: "http";
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  timeoutMs?: number;
  healthUrl?: string;
}

export type AgentConfig = LlmAgentConfig | ProcessAgentConfig | HttpAgentConfig;

export interface Agent {
  id: string;
  name: string;
  description?: string;
  config: AgentConfig;
  concurrency?: number;
  tags?: string[];
  createdAt: number;
}

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "retrying";

export interface TaskSpec {
  id?: string;
  agentId: string;
  input: unknown;
  priority?: number;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  runAt?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  status: TaskStatus;
  output?: unknown;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  attempts: number;
  durationMs?: number;
}

export interface Task extends TaskSpec {
  id: string;
  status: TaskStatus;
  attempts: number;
  result?: TaskResult;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  cancelRequested?: boolean;
}