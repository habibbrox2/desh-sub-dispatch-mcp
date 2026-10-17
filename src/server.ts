import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Dispatcher } from "./dispatcher/dispatcher.js";
import { registerTools } from "./tools/register.js";

export function createServer(opts?: { maxConcurrency?: number }) {
  const dispatcher = new Dispatcher({ maxConcurrency: opts?.maxConcurrency ?? 4 });
  const server = new McpServer(
    { name: "DeshSubDispatch", version: "0.2.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} }, instructions: "Hybrid sub-agent dispatcher. Register agents (llm/process/http) or use skills, then dispatch tasks with orchestration." }
  );
  registerTools(server, dispatcher);
  return { server, dispatcher };
}