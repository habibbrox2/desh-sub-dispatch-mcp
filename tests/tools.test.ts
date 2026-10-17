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