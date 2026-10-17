// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "./server.js";

if (process.argv.includes("--print-config")) {
  const cfg = {
    mcpServers: {
      "sub-agent-dispatcher": {
        command: "node",
        args: [process.argv[1] ?? "dist/index.js"],
      },
    },
  };
  console.log(JSON.stringify(cfg, null, 2));
  process.exit(0);
}

const transportMode = (process.argv.includes("--http") || process.env.TRANSPORT === "http") ? "http" : (process.argv.includes("--both") ? "both" : "stdio");

async function runStdio() {
  const { server } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: any }>();

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const s = sessions.get(sessionId)!;
      await s.transport.handleRequest(req, res, req.body);
      return;
    }
    const { server } = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        sessions.set(sid, { transport, server });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid session");
      return;
    }
    const s = sessions.get(sessionId)!;
    await s.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const s = sessions.get(sessionId)!;
      await s.transport.handleRequest(req, res);
      sessions.delete(sessionId);
    } else {
      res.status(404).send("not found");
    }
  });

  // Legacy SSE transport for older clients
  const sseSessions = new Map<string, SSEServerTransport>();
  app.get("/sse", async (_req, res) => {
    const { server } = createServer();
    const transport = new SSEServerTransport("/messages", res);
    sseSessions.set(transport.sessionId, transport);
    res.on("close", () => sseSessions.delete(transport.sessionId));
    await server.connect(transport);
  });
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = sseSessions.get(sessionId);
    if (!transport) { res.status(404).send("session not found"); return; }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.error(`MCP HTTP server listening on http://localhost:${port}/mcp`);
  });
}

if (transportMode === "stdio") {
  runStdio().catch((e) => { console.error(e); process.exit(1); });
} else if (transportMode === "http") {
  runHttp().catch((e) => { console.error(e); process.exit(1); });
} else {
  runHttp().catch((e) => console.error(e));
  runStdio().catch((e) => { console.error(e); process.exit(1); });
}