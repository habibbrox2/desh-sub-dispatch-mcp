import { describe, it, expect } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHttpApp } from "../src/http.js";

const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

function parseSse(body: string): any {
  const line = body.split("\n").find((l) => l.startsWith("data:"));
  if (!line) throw new Error(`No data line in response: ${body}`);
  return JSON.parse(line.slice(6));
}

async function openSession(port: number): Promise<string> {
  const res = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "http-test", version: "0" },
      },
    }),
  });
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error("no session id issued");
  await res.text();
  await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return sid;
}

async function callTool(port: number, sid: string, name: string, args: unknown): Promise<any> {
  const res = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const parsed = parseSse(await res.text());
  if (parsed.error) throw new Error(`JSON-RPC error: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

describe("HTTP mode", () => {
  it("shares one dispatcher across MCP sessions", async () => {
    const app = createHttpApp({ dbPath: ":memory:" });
    const httpServer: Server = app.listen(0);
    const port = (httpServer.address() as AddressInfo).port;
    try {
      const a = await openSession(port);
      const b = await openSession(port);

      const reg = await callTool(port, a, "register_agent", {
        name: "shared-agent",
        config: { kind: "process", command: "node" },
      });
      expect(reg.isError ?? false).toBe(false);

      const list = await callTool(port, b, "list_agents", {});
      const parsed = JSON.parse(list.content[0].text);
      const agents = Array.isArray(parsed) ? parsed : parsed.items;
      expect(agents.map((x: any) => x.name)).toContain("shared-agent");
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});