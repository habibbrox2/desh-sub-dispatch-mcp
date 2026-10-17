import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHttpApp } from "../src/http.js";

const HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

const authHeaders = (token?: string) =>
  token ? { Authorization: `Bearer ${token}` } : {};

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
  delete process.env.MCP_ALLOW_ANONYMOUS;
});

function startApp(): { port: number; token?: string } {
  const app = createHttpApp({ dbPath: ":memory:" });
  httpServer = app.listen(0);
  return {
    port: (httpServer.address() as AddressInfo).port,
    token: (app.locals as any).authToken,
  };
}

function initReq(port: number, token?: string): Promise<Response> {
  return fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, ...authHeaders(token) },
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

async function openSession(port: number, token?: string): Promise<string> {
  const res = await initReq(port, token);
  const sid = res.headers.get("mcp-session-id");
  if (!sid) throw new Error(`no session id issued (status ${res.status})`);
  await res.text();
  await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, ...authHeaders(token), "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  return sid;
}

async function callTool(port: number, sid: string, name: string, args: unknown, token?: string): Promise<any> {
  const res = await fetch(`http://localhost:${port}/mcp`, {
    method: "POST",
    headers: { ...HEADERS, ...authHeaders(token), "mcp-session-id": sid },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const parsed = parseSse(await res.text());
  if (parsed.error) throw new Error(`JSON-RPC error: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

beforeEach(() => {
  delete process.env.MCP_AUTH_TOKEN;
  delete process.env.MCP_ALLOW_ANONYMOUS;
});

describe("HTTP mode", () => {
  it("shares one dispatcher across MCP sessions", async () => {
    const { port, token } = startApp();
    const a = await openSession(port, token);
    const b = await openSession(port, token);

    const reg = await callTool(port, a, "register_agent", {
      name: "shared-agent",
      config: { kind: "process", command: "node" },
    }, token);
    expect(reg.isError ?? false).toBe(false);

    const list = await callTool(port, b, "list_agents", {}, token);
    const parsed = JSON.parse(list.content[0].text);
    const agents = Array.isArray(parsed) ? parsed : parsed.items;
    expect(agents.map((x: any) => x.name)).toContain("shared-agent");
  });
});

describe("legacy SSE transport", () => {
  it("requires auth and completes an MCP initialize roundtrip", async () => {
    const { port, token } = startApp();

    const un = await fetch(`http://localhost:${port}/sse`);
    expect(un.status).toBe(401);
    await un.text();

    const res = await fetch(`http://localhost:${port}/sse`, { headers: authHeaders(token) });
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

    // POST initialize without waiting: the reply arrives on the SSE stream
    const postP = fetch(`http://localhost:${port}/messages?sessionId=${sessionId}`, {
      method: "POST",
      headers: { ...HEADERS, ...authHeaders(token) },
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

describe("HTTP auth hardening", () => {
  it("rejects unauthenticated /mcp by default and accepts the generated token", async () => {
    const { port, token } = startApp();
    expect(token).toBeTruthy();

    const unauth = await initReq(port);
    expect(unauth.status).toBe(401);

    const sid = await openSession(port, token!);
    expect(sid).toBeTruthy();

    const health = await fetch(`http://localhost:${port}/health`);
    expect(health.status).toBe(200);
    const home = await fetch(`http://localhost:${port}/`);
    expect(home.status).toBe(200);
  });

  it("rejects a wrong bearer token", async () => {
    const { port } = startApp();
    expect((await initReq(port, "wrong-token")).status).toBe(401);
  });

  it("uses MCP_AUTH_TOKEN when configured", async () => {
    process.env.MCP_AUTH_TOKEN = "configured-secret";
    const { port, token } = startApp();
    expect(token).toBe("configured-secret");
    expect((await initReq(port, "other")).status).toBe(401);
    expect((await initReq(port, "configured-secret")).status).toBe(200);
  });

  it("MCP_ALLOW_ANONYMOUS=1 opens the endpoint without a header", async () => {
    process.env.MCP_ALLOW_ANONYMOUS = "1";
    const { port, token } = startApp();
    expect(token).toBeUndefined();
    expect((await initReq(port)).status).toBe(200);
  });
});