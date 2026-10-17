import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Dispatcher } from "./dispatcher/dispatcher.js";
import { registerTools } from "./tools/register.js";
import { registerPrompts } from "./tools/prompts.js";

export interface CreateServerOptions {
  maxConcurrency?: number;
  dbPath?: string;
  /** Reuse an existing dispatcher (e.g. one shared across HTTP sessions). */
  dispatcher?: Dispatcher;
}

export function createServer(opts?: CreateServerOptions) {
  const dispatcher =
    opts?.dispatcher ??
    new Dispatcher({ maxConcurrency: opts?.maxConcurrency ?? 4, dbPath: opts?.dbPath });
  const server = new McpServer(
    { name: "DeshSubDispatch", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: "Hybrid sub-agent dispatcher. Register agents (llm/process/http) or use skills, then dispatch tasks with orchestration." }
  );
  registerTools(server, dispatcher);
  registerPrompts(server);
  return { server, dispatcher };
}