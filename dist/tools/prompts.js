import { z } from "zod";
const text = (body) => ({
    messages: [{ role: "user", content: { type: "text", text: body } }],
});
/**
 * Prompts the server already advertises via `capabilities.prompts`.
 * Each prompt is a recipe for using this server's own tools.
 */
export function registerPrompts(server) {
    server.prompt("dispatch-task", "Run one well-defined job through a sub-agent: pick a skill, register an agent, dispatch, then wait for the result.", { goal: z.string().describe("What the sub-agent should accomplish, in one or two sentences") }, async ({ goal }) => text(`Run this job with the DeshSubDispatch tools: "${goal}"

1. Call list_skills (optionally with a tag like "llm", "code" or "process") and pick the best preset for the job; use get_skill to inspect it first.
2. Call register_agent_from_skill with the chosen skillId (use overrides for model, apiKey or systemPrompt if needed) and keep the returned agent id.
3. Call dispatch_task with { agentId, input: <the work for the agent>, timeoutMs, retries: 1 }. Keep taskId.
4. Poll with get_task_result { taskId, wait: true, timeoutMs: 60000 } until status is a terminal state, then summarize output or error.
5. If it failed after exhausting retries, call retry_task (optionally after register_agent with a different config) and explain what changed.`));
    server.prompt("dag-workflow", "Break a multi-step job into a DAG and run it with dispatch_workflow, then track every node.", { workflow: z.string().describe("The job described as steps, including which steps must run before others") }, async ({ workflow }) => text(`Orchestrate these steps as a DAG: "${workflow}"

1. Split the work into steps. For each, give a short unique key and decide its dependsOn (keys of steps that must succeed first). Mark steps without dependencies as starting points.
2. Register one agent per step type you need: register_agent_from_skill (or register_agent for process/http agents).
3. Call dispatch_workflow with one task per step: { key, agentId, input, dependsOn, timeoutMs, retries }. Keep the returned map of key -> taskId.
4. Poll get_task_status (or get_task_result with wait=true) for each taskId. A step whose dependency failed fails fast with "Dependency failed" — surface that instead of polling forever.
5. For a failed leaf, fix the input or config and call retry_task; report the finished result grouped by step.`));
    server.prompt("monitor-fleet", "Inspect dispatcher health and clean up stuck or failed work.", {}, async () => text(`See what the DeshSubDispatch fleet is doing:

1. Call get_dispatcher_stats for maxConcurrency, active work and entity counts.
2. Call list_tasks filtered by status (failed, retrying, running) to find trouble; narrow by agentId when one agent dominates.
3. For each problematic task: get_task_status for attempts and error; retry_task on failed/cancelled work worth redoing; cancel_task on work that should stop.
4. Summarize throughput (pending vs succeeded vs failed) and recommend one concrete fix, e.g. raising an agent's concurrency or splitting a slow agent.`));
}
//# sourceMappingURL=prompts.js.map