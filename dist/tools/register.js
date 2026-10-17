import { z } from "zod";
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
function toolError(message, hint) {
    return { content: [{ type: "text", text: `${message}\nHint: ${hint}` }], isError: true };
}
const HINT_AGENTS = "call list_agents to see registered ids, or register_agent to create one";
const HINT_SKILLS = "call list_skills to see available skill ids";
const HINT_TASKS = "call list_tasks to see recent task ids";
/** Success result: pretty JSON text (unchanged for existing clients) + validated structuredContent. */
function ok(data, textValue = data) {
    return {
        content: [{ type: "text", text: JSON.stringify(textValue, null, 2) }],
        structuredContent: data,
    };
}
/** List tools keep their array-shaped text; structured content adds a total. */
function okRows(rows) {
    return ok({ items: rows, total: rows.length }, rows);
}
// Shared annotations (MCP tool annotations, per mcp-builder guidance)
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DELETE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const DISPATCH = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
// Reusable output schemas (root-level z.record() breaks SDK 1.32.1 output
// validation, so opaque objects use a passthrough ZodObject instead)
const obj = z.object({}).passthrough();
const listOut = { items: z.array(z.any()), total: z.number() };
const pagedOut = {
    items: z.array(z.any()).describe("Rows for this page"),
    total: z.number().describe("Total matches before pagination"),
    limit: z.number().describe("Page size used"),
    offset: z.number().describe("Rows skipped from the start"),
};
const limitParam = z.number().int().positive().max(500).optional().describe("Max rows to return (default 50, max 500)");
const offsetParam = z.number().int().nonnegative().optional().describe("Rows to skip for pagination (default 0)");
export function registerTools(server, dispatcher) {
    server.registerTool("register_agent", {
        title: "Register agent",
        description: "Register a sub-agent (llm, process, or http) and return it, including its generated id. Use the id as agentId when dispatching tasks.",
        inputSchema: {
            id: z.string().optional().describe("Optional custom agent id; omit to auto-generate a UUID"),
            name: z.string().describe("Human-readable agent name"),
            description: z.string().optional().describe("What this agent does"),
            config: AgentConfigSchema.describe("Agent configuration discriminated by kind: llm, process or http"),
            concurrency: z.number().int().positive().optional().describe("Max tasks this agent runs at once (default 1)"),
            tags: z.array(z.string()).optional().describe("Tags for filtering via list_agents"),
        },
        outputSchema: obj,
        annotations: WRITE,
    }, async (args) => {
        try {
            const agent = dispatcher.registry.register(args);
            return ok(agent);
        }
        catch (e) {
            return toolError(e.message, "omit the id field to auto-generate one, or pick a different id");
        }
    });
    server.registerTool("unregister_agent", {
        title: "Unregister agent",
        description: "Remove a registered agent. Running tasks using it continue to completion; new dispatches to it fail.",
        inputSchema: { id: z.string().describe("Agent id to remove; see list_agents") },
        outputSchema: { ok: z.boolean().describe("True if an agent with this id existed") },
        annotations: DELETE,
    }, async ({ id }) => {
        const existed = dispatcher.registry.unregister(id);
        return ok({ ok: existed });
    });
    server.registerTool("list_agents", {
        title: "List agents",
        description: "List registered agents, newest first, optionally filtered by kind or tag. Paginated (default limit 50, max 500) with a stable total.",
        inputSchema: {
            kind: z.string().optional().describe("Filter by agent kind: llm | process | http"),
            tag: z.string().optional().describe("Filter by an exact tag"),
            limit: limitParam,
            offset: offsetParam,
        },
        outputSchema: pagedOut,
        annotations: READ,
    }, async ({ kind, tag, limit, offset }) => {
        const all = dispatcher.registry.list({ kind, tag });
        const lim = Math.min(limit ?? 50, 500);
        const off = offset ?? 0;
        return ok({ items: all.slice(off, off + lim), total: all.length, limit: lim, offset: off });
    });
    server.registerTool("get_agent", {
        title: "Get agent",
        description: "Fetch one agent by id, including its full configuration.",
        inputSchema: { id: z.string().describe("Agent id; see list_agents") },
        outputSchema: obj,
        annotations: READ,
    }, async ({ id }) => {
        const a = dispatcher.registry.get(id);
        if (!a)
            return toolError(`Agent not found: ${id}`, HINT_AGENTS);
        return ok(a);
    });
    server.registerTool("dispatch_task", {
        title: "Dispatch task",
        description: "Dispatch a single task to an agent. Returns taskId immediately with status pending/queued; poll get_task_result (or pass wait=true) for the outcome.",
        inputSchema: {
            agentId: z.string().describe("Registered agent id that will run the task; see list_agents"),
            input: z.any().describe("Task input: string, or an object (LLM agents accept { text, images })"),
            priority: z.number().optional().describe("Higher runs first (default 0)"),
            timeoutMs: z.number().optional().describe("Execution timeout in milliseconds (default 60000)"),
            retries: z.number().int().nonnegative().optional().describe("Extra attempts after a failure (default 0)"),
            retryDelayMs: z.number().optional().describe("Delay between retries in milliseconds (default 1000)"),
            dependencies: z.array(z.string()).optional().describe("Task ids that must succeed before this runs"),
            metadata: z.record(z.any()).optional().describe("Free-form metadata; webhookUrl triggers a POST on completion (http/https, public hosts only)"),
            id: z.string().optional().describe("Optional custom task id; omit to auto-generate a UUID"),
        },
        outputSchema: { taskId: z.string().describe("Id to use with get_task_status/get_task_result"), status: z.string().describe("Initial status: pending or queued") },
        annotations: DISPATCH,
    }, async (args) => {
        if (!dispatcher.registry.get(args.agentId)) {
            return toolError(`Unknown agent: ${args.agentId}`, HINT_AGENTS);
        }
        const task = dispatcher.submit(args);
        return ok({ taskId: task.id, status: task.status });
    });
    server.registerTool("dispatch_batch", {
        title: "Dispatch batch",
        description: "Dispatch multiple tasks atomically: every agentId is validated first, then all tasks are queued together.",
        inputSchema: {
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
            })).describe("Tasks to queue; same fields as dispatch_task"),
        },
        outputSchema: { tasks: z.array(z.object({ taskId: z.string(), status: z.string() })).describe("One entry per created task, in input order") },
        annotations: DISPATCH,
    }, async ({ tasks }) => {
        const missing = tasks.find((t) => !dispatcher.registry.get(t.agentId));
        if (missing) {
            return toolError(`Unknown agent: ${missing.agentId} (task ${missing.id ?? "<auto>"})`, HINT_AGENTS);
        }
        const created = dispatcher.submitMany(tasks);
        return ok({ tasks: created.map((t) => ({ taskId: t.id, status: t.status })) });
    });
    server.registerTool("dispatch_workflow", {
        title: "Dispatch workflow (DAG)",
        description: "Dispatch a DAG of tasks. Steps declare dependsOn by key (not id); a step runs only after its dependencies succeed, and fails fast if one fails.",
        inputSchema: {
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
            })).describe("Workflow steps; dependsOn lists other steps' keys"),
        },
        outputSchema: z.object({}).catchall(z.string()).describe("Map of step key -> task id"),
        annotations: DISPATCH,
    }, async ({ tasks }) => {
        const missing = tasks.find((t) => !dispatcher.registry.get(t.agentId));
        if (missing) {
            return toolError(`Unknown agent: ${missing.agentId} (workflow step "${missing.key}")`, HINT_AGENTS);
        }
        const mapping = dispatcher.runWorkflow(tasks.map((t) => ({ key: t.key, spec: t })));
        return ok(mapping);
    });
    server.registerTool("get_task_status", {
        title: "Get task status",
        description: "Get a task's current status, attempt count and error if any.",
        inputSchema: { taskId: z.string().describe("Task id returned by dispatch_task") },
        outputSchema: obj,
        annotations: READ,
    }, async ({ taskId }) => {
        const t = dispatcher.getStatus(taskId);
        if (!t)
            return toolError(`Task not found: ${taskId}`, HINT_TASKS);
        return ok({ id: t.id, agentId: t.agentId, status: t.status, attempts: t.attempts, startedAt: t.startedAt, finishedAt: t.finishedAt, error: t.result?.error });
    });
    server.registerTool("get_task_result", {
        title: "Get task result",
        description: "Get a task's full result (output or error). With wait=true, blocks until the task finishes or the timeout elapses.",
        inputSchema: {
            taskId: z.string().describe("Task id returned by dispatch_task"),
            wait: z.boolean().optional().describe("Poll until the task reaches a terminal state"),
            timeoutMs: z.number().optional().describe("Max wait in milliseconds when wait=true (default 30000)"),
        },
        outputSchema: obj,
        annotations: READ,
    }, async ({ taskId, wait, timeoutMs }) => {
        if (wait) {
            const deadline = Date.now() + (timeoutMs ?? 30000);
            while (true) {
                const t = dispatcher.getStatus(taskId);
                if (!t)
                    return toolError(`Task not found: ${taskId}`, HINT_TASKS);
                if (["succeeded", "failed", "cancelled"].includes(t.status))
                    break;
                if (Date.now() > deadline)
                    break;
                await new Promise((r) => setTimeout(r, 250));
            }
        }
        const t = dispatcher.getStatus(taskId);
        if (!t)
            return toolError(`Task not found: ${taskId}`, HINT_TASKS);
        return ok((t.result ?? { status: t.status }));
    });
    server.registerTool("cancel_task", {
        title: "Cancel task",
        description: "Cancel a pending, queued or running task (running work is aborted; terminal tasks are left as-is).",
        inputSchema: { taskId: z.string().describe("Task id to cancel") },
        outputSchema: { id: z.string(), status: z.string().describe("Status after the cancellation attempt") },
        annotations: WRITE,
    }, async ({ taskId }) => {
        try {
            const t = dispatcher.cancel(taskId);
            return ok({ id: t.id, status: t.status });
        }
        catch (e) {
            return toolError(e.message, HINT_TASKS);
        }
    });
    server.registerTool("retry_task", {
        title: "Retry task",
        description: "Reset a failed or cancelled task to pending so the dispatcher picks it up again.",
        inputSchema: { taskId: z.string().describe("Task id to retry") },
        outputSchema: { id: z.string(), status: z.string().describe("Status after the reset (pending)") },
        annotations: WRITE,
    }, async ({ taskId }) => {
        try {
            const t = dispatcher.retry(taskId);
            return ok({ id: t.id, status: t.status });
        }
        catch (e) {
            return toolError(e.message, HINT_TASKS);
        }
    });
    server.registerTool("list_tasks", {
        title: "List tasks",
        description: "List tasks, newest first, optionally filtered by status or agent. Paginated (default limit 50, max 500) with a stable total.",
        inputSchema: {
            status: z.string().optional().describe("Filter by status: pending | queued | running | retrying | succeeded | failed | cancelled"),
            agentId: z.string().optional().describe("Filter by agent id"),
            limit: limitParam,
            offset: offsetParam,
        },
        outputSchema: pagedOut,
        annotations: READ,
    }, async ({ status, agentId, limit, offset }) => {
        const rows = dispatcher.store.list({ status, agentId }).map((t) => ({ id: t.id, agentId: t.agentId, status: t.status, priority: t.priority, createdAt: t.createdAt }));
        const lim = Math.min(limit ?? 50, 500);
        const off = offset ?? 0;
        return ok({ items: rows.slice(off, off + lim), total: rows.length, limit: lim, offset: off });
    });
    server.registerTool("get_dispatcher_stats", {
        title: "Get dispatcher stats",
        description: "Snapshot the dispatcher: concurrency limits, active work and entity counts.",
        inputSchema: {},
        outputSchema: obj,
        annotations: READ,
    }, async () => {
        return ok(dispatcher.getStats());
    });
    // Skills
    server.registerTool("list_skills", {
        title: "List skills",
        description: "List built-in skill presets an agent can be created from (see register_agent_from_skill).",
        inputSchema: { tag: z.string().optional().describe("Filter by an exact tag, e.g. llm, code, process, http") },
        outputSchema: listOut,
        annotations: READ,
    }, async ({ tag }) => {
        return okRows(dispatcher.skills.list(tag ? { tag } : undefined));
    });
    server.registerTool("get_skill", {
        title: "Get skill",
        description: "Fetch one skill preset by id, including its agent config template.",
        inputSchema: { id: z.string().describe("Skill id; see list_skills") },
        outputSchema: obj,
        annotations: READ,
    }, async ({ id }) => {
        const s = dispatcher.skills.get(id);
        if (!s)
            return toolError(`Skill not found: ${id}`, HINT_SKILLS);
        return ok(s);
    });
    server.registerTool("register_agent_from_skill", {
        title: "Register agent from skill",
        description: "Create a new agent from a skill preset (e.g. coder, researcher, summarizer), optionally overriding its config, and return the agent with its id.",
        inputSchema: {
            skillId: z.string().describe("Preset id from list_skills"),
            name: z.string().optional().describe("Name for the new agent (default: skill name)"),
            overrides: z.record(z.any()).optional().describe("Fields merged over the skill's agentConfig, e.g. model or apiKey"),
            concurrency: z.number().int().positive().optional().describe("Max concurrent tasks for this agent (default 1)"),
            tags: z.array(z.string()).optional().describe("Tags for the new agent (default: skill tags)"),
        },
        outputSchema: obj,
        annotations: WRITE,
    }, async (args) => {
        const skill = dispatcher.skills.get(args.skillId);
        if (!skill)
            return toolError(`Skill not found: ${args.skillId}`, HINT_SKILLS);
        const config = { ...skill.agentConfig, ...(args.overrides ?? {}) };
        try {
            const agent = dispatcher.registry.register({
                name: args.name ?? skill.name,
                description: skill.description,
                config,
                concurrency: args.concurrency,
                tags: args.tags ?? skill.tags,
            });
            return ok(agent);
        }
        catch (e) {
            return toolError(e.message, "omit the name or choose a different one");
        }
    });
    // Expose skills as MCP resources
    for (const skill of dispatcher.skills.list()) {
        server.resource(skill.name, `skill://${skill.id}`, async (uri) => ({
            contents: [{ uri: uri.href, text: JSON.stringify(skill, null, 2), mimeType: "application/json" }],
        }));
    }
    server.resource("skills-list", "skills://list", async (uri) => ({
        contents: [{ uri: uri.href, text: JSON.stringify(dispatcher.skills.list(), null, 2), mimeType: "application/json" }],
    }));
}
//# sourceMappingURL=register.js.map