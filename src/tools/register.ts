import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Dispatcher } from "../dispatcher/dispatcher.js";

const LlmConfigSchema = z.object({
  kind: z.literal("llm"),
  provider: z.enum(["openai", "anthropic", "generic"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string(),
  systemPrompt: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
});

const ProcessConfigSchema = z.object({
  kind: z.literal("process"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  shell: z.boolean().optional(),
});

const HttpConfigSchema = z.object({
  kind: z.literal("http"),
  url: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
  headers: z.record(z.string()).optional(),
  timeoutMs: z.number().optional(),
});

const AgentConfigSchema = z.discriminatedUnion("kind", [LlmConfigSchema, ProcessConfigSchema, HttpConfigSchema]);

/** Error result whose text carries an actionable next step for the calling agent. */
function toolError(message: string, hint: string) {
  return { content: [{ type: "text" as const, text: `${message}\nHint: ${hint}` }], isError: true };
}

const HINT_AGENTS = "call list_agents to see registered ids, or register_agent to create one";
const HINT_SKILLS = "call list_skills to see available skill ids";
const HINT_TASKS = "call list_tasks to see recent task ids";

export function registerTools(server: McpServer, dispatcher: Dispatcher) {
  server.tool("register_agent", "Register a sub-agent (llm, process, or http).", {
    id: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    config: AgentConfigSchema,
    concurrency: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
  }, async (args: any) => {
    try {
      const agent = dispatcher.registry.register(args);
      return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
    } catch (e: any) {
      return toolError(e.message, "omit the id field to auto-generate one, or pick a different id");
    }
  });

  server.tool("unregister_agent", "Remove a registered agent.", { id: z.string() }, async ({ id }: any) => {
    const ok = dispatcher.registry.unregister(id);
    return { content: [{ type: "text", text: JSON.stringify({ ok }) }] };
  });

  server.tool("list_agents", "List registered agents.", { kind: z.string().optional(), tag: z.string().optional() }, async (filter: any) => {
    const agents = dispatcher.registry.list(filter);
    return { content: [{ type: "text", text: JSON.stringify(agents, null, 2) }] };
  });

  server.tool("get_agent", "Get a single agent by id.", { id: z.string() }, async ({ id }: any) => {
    const a = dispatcher.registry.get(id);
    if (!a) return toolError(`Agent not found: ${id}`, HINT_AGENTS);
    return { content: [{ type: "text", text: JSON.stringify(a, null, 2) }] };
  });

  server.tool("dispatch_task", "Dispatch a single task to an agent.", {
    agentId: z.string(),
    input: z.any(),
    priority: z.number().optional(),
    timeoutMs: z.number().optional(),
    retries: z.number().int().nonnegative().optional(),
    retryDelayMs: z.number().optional(),
    dependencies: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
    id: z.string().optional(),
  }, async (args: any) => {
    if (!dispatcher.registry.get(args.agentId)) {
      return toolError(`Unknown agent: ${args.agentId}`, HINT_AGENTS);
    }
    const task = dispatcher.submit(args);
    return { content: [{ type: "text", text: JSON.stringify({ taskId: task.id, status: task.status }, null, 2) }] };
  });

  server.tool("dispatch_batch", "Dispatch multiple tasks at once.", {
    tasks: z.array(z.object({
      agentId: z.string(),
      input: z.any(),
      priority: z.number().optional(),
      timeoutMs: z.number().optional(),
      retries: z.number().int().nonnegative().optional(),
      retryDelayMs: z.number().optional(),
      dependencies: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
      id: z.string().optional(),
    })),
  }, async ({ tasks }: any) => {
    const missing = tasks.find((t: any) => !dispatcher.registry.get(t.agentId));
    if (missing) {
      return toolError(`Unknown agent: ${missing.agentId} (task ${missing.id ?? "<auto>"})`, HINT_AGENTS);
    }
    const created = dispatcher.submitMany(tasks);
    return { content: [{ type: "text", text: JSON.stringify(created.map((t: any) => ({ taskId: t.id, status: t.status })), null, 2) }] };
  });

  server.tool("dispatch_workflow", "Dispatch a workflow (DAG) of tasks with dependencies by key.", {
    tasks: z.array(z.object({
      key: z.string(),
      agentId: z.string(),
      input: z.any(),
      priority: z.number().optional(),
      timeoutMs: z.number().optional(),
      retries: z.number().int().nonnegative().optional(),
      retryDelayMs: z.number().optional(),
      dependsOn: z.array(z.string()).optional(),
      metadata: z.record(z.any()).optional(),
    })),
  }, async ({ tasks }: any) => {
    const missing = tasks.find((t: any) => !dispatcher.registry.get(t.agentId));
    if (missing) {
      return toolError(`Unknown agent: ${missing.agentId} (workflow step "${missing.key}")`, HINT_AGENTS);
    }
    const mapping = dispatcher.runWorkflow(tasks.map((t: any) => ({ key: t.key, spec: t })));
    return { content: [{ type: "text", text: JSON.stringify(mapping, null, 2) }] };
  });

  server.tool("get_task_status", "Get status of a task.", { taskId: z.string() }, async ({ taskId }: any) => {
    const t = dispatcher.getStatus(taskId);
    if (!t) return toolError(`Task not found: ${taskId}`, HINT_TASKS);
    return { content: [{ type: "text", text: JSON.stringify({ id: t.id, agentId: t.agentId, status: t.status, attempts: t.attempts, startedAt: t.startedAt, finishedAt: t.finishedAt, error: t.result?.error }, null, 2) }] };
  });

  server.tool("get_task_result", "Get full result/output of a task.", { taskId: z.string(), wait: z.boolean().optional(), timeoutMs: z.number().optional() }, async ({ taskId, wait, timeoutMs }: any) => {
    if (wait) {
      const deadline = Date.now() + (timeoutMs ?? 30000);
      while (true) {
        const t = dispatcher.getStatus(taskId);
        if (!t) return toolError(`Task not found: ${taskId}`, HINT_TASKS);
        if (["succeeded", "failed", "cancelled"].includes(t.status)) break;
        if (Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const t = dispatcher.getStatus(taskId);
    if (!t) return toolError(`Task not found: ${taskId}`, HINT_TASKS);
    return { content: [{ type: "text", text: JSON.stringify(t.result ?? { status: t.status }, null, 2) }] };
  });

  server.tool("cancel_task", "Cancel a task.", { taskId: z.string() }, async ({ taskId }: any) => {
    try {
      const t = dispatcher.cancel(taskId);
      return { content: [{ type: "text", text: JSON.stringify({ id: t.id, status: t.status }) }] };
    } catch (e: any) {
      return toolError(e.message, HINT_TASKS);
    }
  });

  server.tool("retry_task", "Retry a failed/cancelled task.", { taskId: z.string() }, async ({ taskId }: any) => {
    try {
      const t = dispatcher.retry(taskId);
      return { content: [{ type: "text", text: JSON.stringify({ id: t.id, status: t.status }) }] };
    } catch (e: any) {
      return toolError(e.message, HINT_TASKS);
    }
  });

  server.tool("list_tasks", "List tasks.", { status: z.string().optional(), agentId: z.string().optional(), limit: z.number().int().positive().optional() }, async (filter: any) => {
    let tasks = dispatcher.store.list(filter);
    if (filter.limit) tasks = tasks.slice(0, filter.limit);
    return { content: [{ type: "text", text: JSON.stringify(tasks.map((t: any) => ({ id: t.id, agentId: t.agentId, status: t.status, priority: t.priority, createdAt: t.createdAt })), null, 2) }] };
  });

  server.tool("get_dispatcher_stats", "Get dispatcher stats.", {}, async () => {
    return { content: [{ type: "text", text: JSON.stringify({ maxConcurrency: (dispatcher as any).maxConcurrency, active: (dispatcher as any).active, tasks: dispatcher.store.size(), agents: dispatcher.registry.list().length }) }] };
  });

  // Skills
  server.tool("list_skills", "List available skills/presets.", { tag: z.string().optional() }, async ({ tag }: any) => {
    const skills = dispatcher.skills.list(tag ? { tag } : undefined);
    return { content: [{ type: "text", text: JSON.stringify(skills, null, 2) }] };
  });

  server.tool("get_skill", "Get a skill by id.", { id: z.string() }, async ({ id }: any) => {
    const s = dispatcher.skills.get(id);
    if (!s) return toolError(`Skill not found: ${id}`, HINT_SKILLS);
    return { content: [{ type: "text", text: JSON.stringify(s, null, 2) }] };
  });

  server.tool("register_agent_from_skill", "Create an agent from a skill preset.", {
    skillId: z.string(),
    name: z.string().optional(),
    overrides: z.record(z.any()).optional(),
    concurrency: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
  }, async (args: any) => {
    const skill = dispatcher.skills.get(args.skillId);
    if (!skill) return toolError(`Skill not found: ${args.skillId}`, HINT_SKILLS);
    const config = { ...skill.agentConfig, ...(args.overrides ?? {}) };
    const agent = dispatcher.registry.register({
      name: args.name ?? skill.name,
      description: skill.description,
      config,
      concurrency: args.concurrency,
      tags: args.tags ?? skill.tags,
    });
    return { content: [{ type: "text", text: JSON.stringify(agent, null, 2) }] };
  });

  // Expose skills as MCP resources
  for (const skill of dispatcher.skills.list()) {
    server.resource(skill.name, `skill://${skill.id}`, async (uri: any) => ({
      contents: [{ uri: uri.href, text: JSON.stringify(skill, null, 2), mimeType: "application/json" }],
    }));
  }
  server.resource("skills-list", "skills://list", async (uri: any) => ({
    contents: [{ uri: uri.href, text: JSON.stringify(dispatcher.skills.list(), null, 2), mimeType: "application/json" }],
  }));
}