import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";

async function waitFor(pred: () => boolean | Promise<boolean>, ms = 8000, step = 25): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("timeout waiting for condition");
}

describe("orchestration under failure", () => {
  it("recovers a flaky task through the retry path (attempts=2)", async () => {
    const { dispatcher } = createServer({ dbPath: ":memory:" });
    const marker = join(mkdtempSync(join(tmpdir(), "desh-retry-")), "attempted");
    expect(existsSync(marker)).toBe(false);
    const script =
      'const fs=require("fs");const m=process.argv[1];' +
      'if(!fs.existsSync(m)){fs.writeFileSync(m,"1");process.stderr.write("boom");process.exit(3)}' +
      'process.stdout.write("recovered")';
    const agent = dispatcher.registry.register({
      name: "flaky-once",
      config: { kind: "process", command: "node", args: ["-e", script, marker] } as any,
    });
    const task = dispatcher.submit({ agentId: agent.id, input: "x", retries: 1, retryDelayMs: 50, timeoutMs: 5000 });

    await waitFor(() => ["succeeded", "failed"].includes(dispatcher.getStatus(task.id)!.status));
    const t = dispatcher.getStatus(task.id)!;
    expect(t.status).toBe("succeeded");
    expect(t.attempts).toBe(2);
    expect(t.result?.output).toBe("recovered");
  });

  it("cancels a running task and it stays cancelled after the process dies", async () => {
    const { dispatcher } = createServer({ dbPath: ":memory:" });
    const agent = dispatcher.registry.register({
      name: "long-runner",
      config: { kind: "process", command: "node", args: ["-e", "setInterval(function(){},1000)"] } as any,
    });
    const task = dispatcher.submit({ agentId: agent.id, input: "x", timeoutMs: 30000 });

    await waitFor(() => dispatcher.getStatus(task.id)!.status === "running");
    const cancelled = dispatcher.cancel(task.id);
    expect(cancelled.status).toBe("cancelled");

    // let the aborted executor settle: it must not flip the task to failed/succeeded
    await new Promise((r) => setTimeout(r, 400));
    expect(dispatcher.getStatus(task.id)!.status).toBe("cancelled");

    // cancelling an already-terminal task is a safe no-op
    expect(dispatcher.cancel(task.id).status).toBe("cancelled");
  });

  it("marks downstream DAG steps 'Dependency failed' without ever running them", async () => {
    const { dispatcher } = createServer({ dbPath: ":memory:" });
    const failAgent = dispatcher.registry.register({
      name: "always-fails",
      config: { kind: "process", command: "node", args: ["-e", "process.stderr.write('nope');process.exit(1)"] } as any,
    });
    const mapping = dispatcher.runWorkflow([
      { key: "bad", spec: { agentId: failAgent.id, input: "x", timeoutMs: 5000 } },
      { key: "after", spec: { agentId: failAgent.id, input: "y", dependsOn: ["bad"] } },
      { key: "deeper", spec: { agentId: failAgent.id, input: "z", dependsOn: ["after"] } },
    ]);

    await waitFor(() => ["failed", "succeeded"].includes(dispatcher.getStatus(mapping.bad)!.status));
    const bad = dispatcher.getStatus(mapping.bad)!;
    expect(bad.status).toBe("failed");
    expect(bad.attempts).toBe(1);
    expect(bad.result?.error).toContain("Process exited 1");

    await waitFor(() => dispatcher.getStatus(mapping.after)!.status === "failed");
    const after = dispatcher.getStatus(mapping.after)!;
    expect(after.result?.error).toBe("Dependency failed");
    expect(after.attempts).toBe(0);

    await waitFor(() => dispatcher.getStatus(mapping.deeper)!.status === "failed");
    const deeper = dispatcher.getStatus(mapping.deeper)!;
    expect(deeper.result?.error).toBe("Dependency failed");
    expect(deeper.attempts).toBe(0);
  });
});