import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

async function openSession() {
  const { server, dispatcher } = createServer({ dbPath: ":memory:" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tools-test", version: "0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, dispatcher };
}

function text0(r: any): string {
  return r.content?.[0]?.text ?? "";
}

describe("tool metadata", () => {
  const RECORDED = [
    "register_agent", "unregister_agent", "list_agents", "get_agent",
    "dispatch_task", "dispatch_batch", "dispatch_workflow",
    "get_task_status", "get_task_result", "cancel_task", "retry_task",
    "list_tasks", "get_dispatcher_stats", "list_skills", "get_skill",
    "register_agent_from_skill",
  ];

  it("all 16 tools advertise annotations and output schemas", async () => {
    const { client } = await openSession();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...RECORDED].sort());
    for (const t of tools) {
      expect(t.annotations, `annotations missing for ${t.name}`).toBeTruthy();
      expect(t.outputSchema, `outputSchema missing for ${t.name}`).toBeTruthy();
    }
  });

  it("readOnly annotations on read-only tools, openWorld on dispatch", async () => {
    const { client } = await openSession();
    const { tools } = await client.listTools();
    const listTasks = tools.find((t) => t.name === "list_tasks")!;
    expect(listTasks.annotations?.readOnlyHint).toBe(true);
    const dispatch = tools.find((t) => t.name === "dispatch_task")!;
    expect(dispatch.annotations?.openWorldHint).toBe(true);
    const unreg = tools.find((t) => t.name === "unregister_agent")!;
    expect(unreg.annotations?.destructiveHint).toBe(true);
  });

  it("key params carry descriptions", async () => {
    const { client } = await openSession();
    const { tools } = await client.listTools();
    const dt = tools.find((t) => t.name === "dispatch_task")!;
    const props = (dt.inputSchema as any).properties;
    expect(props.agentId.description).toBeTruthy();
    expect(props.timeoutMs.description).toBeTruthy();
  });

  it("successful calls return structuredContent", async () => {
    const { client } = await openSession();
    const r: any = await client.callTool({ name: "get_dispatcher_stats", arguments: {} });
    expect(typeof r.structuredContent?.maxConcurrency).toBe("number");
    const list: any = await client.callTool({ name: "list_skills", arguments: {} });
    expect(Array.isArray(list.structuredContent?.items)).toBe(true);
    expect(typeof list.structuredContent?.total).toBe("number");
  });
  it("every tool's success path returns matching structuredContent", async () => {
    const { client } = await openSession();

    const skillAgent: any = await client.callTool({ name: "register_agent_from_skill", arguments: { skillId: "summarizer", name: "sum-1" } });
    expect(skillAgent.structuredContent?.id).toBeTruthy();
    expect(skillAgent.structuredContent?.name).toBe("sum-1");

    const reg: any = await client.callTool({
      name: "register_agent",
      arguments: { name: "echo", config: { kind: "process", command: "node", args: ["-e", "process.stdout.write('ok')"] } },
    });
    const agentId = reg.structuredContent?.id as string;
    expect(agentId).toBeTruthy();

    const got: any = await client.callTool({ name: "get_agent", arguments: { id: agentId } });
    expect(got.structuredContent?.id).toBe(agentId);
    const listAgents: any = await client.callTool({ name: "list_agents", arguments: {} });
    expect(listAgents.structuredContent?.total).toBeGreaterThan(0);
    const skillsList: any = await client.callTool({ name: "list_skills", arguments: { tag: "code" } });
    expect(skillsList.structuredContent?.total).toBeGreaterThan(0);
    const skill: any = await client.callTool({ name: "get_skill", arguments: { id: "coder" } });
    expect(skill.structuredContent?.id).toBe("coder");

    const d: any = await client.callTool({ name: "dispatch_task", arguments: { agentId, input: "hi" } });
    const taskId = d.structuredContent?.taskId as string;
    expect(taskId).toBeTruthy();

    const batch: any = await client.callTool({ name: "dispatch_batch", arguments: { tasks: [{ agentId, input: "b" }] } });
    expect(batch.structuredContent?.tasks?.[0]?.taskId).toBeTruthy();

    const wf: any = await client.callTool({ name: "dispatch_workflow", arguments: { tasks: [{ key: "only", agentId, input: "w" }] } });
    expect(typeof wf.structuredContent?.only).toBe("string");

    const status: any = await client.callTool({ name: "get_task_status", arguments: { taskId } });
    expect(status.structuredContent?.id).toBe(taskId);
    const finished: any = await client.callTool({ name: "get_task_result", arguments: { taskId, wait: true, timeoutMs: 10000 } });
    expect(finished.structuredContent?.status ?? finished.structuredContent?.taskId).toBeTruthy();

    const cancel: any = await client.callTool({ name: "cancel_task", arguments: { taskId } });
    expect(cancel.structuredContent?.id).toBe(taskId);
    const retry: any = await client.callTool({ name: "retry_task", arguments: { taskId } });
    expect(retry.structuredContent?.status).toBe("pending");

    const stats: any = await client.callTool({ name: "get_dispatcher_stats", arguments: {} });
    expect(typeof stats.structuredContent?.maxConcurrency).toBe("number");
    const listT: any = await client.callTool({ name: "list_tasks", arguments: {} });
    expect(Array.isArray(listT.structuredContent?.items)).toBe(true);
    expect(listT.structuredContent?.total).toBeGreaterThan(0);

    const unreg: any = await client.callTool({ name: "unregister_agent", arguments: { id: agentId } });
    expect(unreg.structuredContent).toEqual({ ok: true });
  });
});

describe("prompts", () => {
  it("lists the three advertised prompts", async () => {
    const { client } = await openSession();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["dag-workflow", "dispatch-task", "monitor-fleet"]);
  });

  it("dispatch-task prompt returns a recipe using this server's tools", async () => {
    const { client } = await openSession();
    const r = await client.getPrompt({ name: "dispatch-task", arguments: { goal: "summarize a README" } });
    const text = r.messages.map((m: any) => m.content.text ?? "").join(" ");
    expect(text).toContain("dispatch_task");
    expect(text).toContain("get_task_result");
    expect(text).toContain("summarize a README");
  });

  it("monitor-fleet prompt needs no arguments", async () => {
    const { client } = await openSession();
    const r = await client.getPrompt({ name: "monitor-fleet", arguments: {} });
    expect(r.messages.length).toBeGreaterThan(0);
    expect(r.messages.map((m: any) => m.content.text ?? "").join(" ")).toContain("get_dispatcher_stats");
  });
});

describe("actionable errors", () => {
  it("dispatch_task rejects an unknown agent with a hint", async () => {
    const { client } = await openSession();
    const r: any = await client.callTool({ name: "dispatch_task", arguments: { agentId: "ghost-1", input: "x" } });
    expect(r.isError).toBe(true);
    expect(text0(r)).toContain("ghost-1");
    expect(text0(r)).toContain("list_agents");
  });

  it("get_skill unknown id points at list_skills", async () => {
    const { client } = await openSession();
    const r: any = await client.callTool({ name: "get_skill", arguments: { id: "nope" } });
    expect(text0(r)).toMatch(/list_skills/);
  });

  it("get_agent unknown id points at list_agents", async () => {
    const { client } = await openSession();
    const r: any = await client.callTool({ name: "get_agent", arguments: { id: "nope" } });
    expect(text0(r)).toMatch(/list_agents/);
  });

  it("dispatch_batch rejects a batch containing an unknown agent", async () => {
    const { client } = await openSession();
    const r: any = await client.callTool({
      name: "dispatch_batch",
      arguments: { tasks: [{ agentId: "ghost-2", input: "x" }] },
    });
    expect(r.isError).toBe(true);
    expect(text0(r)).toContain("ghost-2");
  });

  it("valid dispatch still works", async () => {
    const { client } = await openSession();
    const reg: any = await client.callTool({
      name: "register_agent",
      arguments: { name: "echo", config: { kind: "process", command: "node" } },
    });
    const agent = JSON.parse(text0(reg));
    const d: any = await client.callTool({
      name: "dispatch_task",
      arguments: { agentId: agent.id, input: "hi" },
    });
    expect(d.isError ?? false).toBe(false);
    expect(JSON.parse(text0(d)).taskId).toBeTruthy();
  });
});