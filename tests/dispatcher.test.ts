import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";

describe("dispatcher", () => {
  it("registers agent and dispatches process task", async () => {
    const { dispatcher } = createServer({ dbPath: ":memory:" });
    const agent = dispatcher.registry.register({ name: "cat", config: { kind: "process", command: "node", args: ["-e", "process.stdin.pipe(process.stdout)"] } as any });
    const task = dispatcher.submit({ agentId: agent.id, input: "hello", timeoutMs: 5000 });
    await new Promise((r) => setTimeout(r, 500));
    const t = dispatcher.getStatus(task.id)!;
    expect(t.status).toBe("succeeded");
  });

  it("workflow dependencies", async () => {
    const { dispatcher } = createServer({ dbPath: ":memory:" });
    const a = dispatcher.registry.register({ name: "cat", config: { kind: "process", command: "node", args: ["-e", "process.stdin.pipe(process.stdout)"] } as any });
    const mapping = dispatcher.runWorkflow([
      { key: "first", spec: { agentId: a.id, input: "a" } },
      { key: "second", spec: { agentId: a.id, input: "b", dependsOn: ["first"] } },
    ]);
    await new Promise((r) => setTimeout(r, 1000));
    const second = dispatcher.getStatus(mapping.second)!;
    expect(second.status).toBe("succeeded");
  });
});
