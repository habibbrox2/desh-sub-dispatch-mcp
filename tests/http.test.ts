import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

let httpServer: Server | undefined;
afterEach(async () => {
  if (httpServer) {
    const s = httpServer;
    httpServer = undefined;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  delete process.env.MCP_AUTH_TOKEN;
});

function startApp(): { port: number } {
  const app = createHttpApp({ dbPath: ":memory:" });
  httpServer = app.listen(0);
  return {
    port: (httpServer.address() as AddressInfo).port,
  };
}

function initReq(port: number): Promise<Response> {
  return fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS },
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
}

async function openSession(port: number): Promise<string> {
  const res = await initReq(port);
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error(`no session id issued (status ${res.status})`);
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

beforeEach(() => {
  delete process.env.MCP_AUTH_TOKEN;
});

describe("HTTP mode", () => {
  it("shares one dispatcher across MCP sessions", async () => {
    const { port } = startApp();
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
  });

  it("works without any auth token (open by default)", async () => {
    const { port } = startApp();
    const res = await initReq(port);
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
  });
});

describe("legacy SSE transport", () => {
  it("completes an MCP initialize roundtrip without auth", async () => {
    const { port } = startApp();

    const res = await fetch(`http://localhost:${port}/sse`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let sessionId = "";
    while (!sessionId) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
      const m = buf.match(/event: endpoint\r?\ndata: \/messages\?sessionId=([0-9a-f-]+)/);
      if (m) sessionId = m[1];
    }
    expect(sessionId).toBeTruthy();

    const postP = fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { ...HEADERS },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "sse-test", version: "0" } },
      }),
    });
    let stream = "";
    while (!stream.includes('"result"')) {
      const { value, done } = await reader.read();
      if (done) break;
      stream += dec.decode(value);
    }
    expect(stream).toContain('"result"');
    const post = await postP;
    expect(post.status).toBe(202);
    expect(stream).toContain('"serverInfo"');
    await reader.cancel().catch(() => {});
  });
});

describe("optional auth", () => {
  it("uses MCP_AUTH_TOKEN when configured", async () => {
    process.env.MCP_AUTH_TOKEN = "configured-secret";
    const { port } = startApp();

    const unauth = await initReq(port);
    expect(unauth.status).toBe(401);

    const auth = await fetch(`http://localhost:${port}/mcp`, {
      method: "POST",
      headers: { ...HEADERS, Authorization: "Bearer configured-secret" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "http-test", version: "0" } },
      }),
    });
    expect(auth.status).toBe(200);
  });

  it("health and homepage are always open", async () => {
    const { port } = startApp();
    const health = await fetch(`http://localhost:${port}/health`);
    expect(health.status).toBe(200);
    const home = await fetch(`http://localhost:${port}/`);
    expect(home.status).toBe(200);
  });
});
