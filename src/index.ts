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

  // CORS
  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Mcp-Session-Id,Accept");
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });

  // Simple rate limiter (per IP)
  const rateLimit = Number(process.env.RATE_LIMIT_PER_MIN ?? 0);
  const buckets = new Map<string, { count: number; reset: number }>();
  if (rateLimit > 0) {
    app.use((req, res, next) => {
      const ip = req.ip || "unknown";
      const now = Date.now();
      let b = buckets.get(ip);
      if (!b || now > b.reset) { b = { count: 0, reset: now + 60000 }; buckets.set(ip, b); }
      b.count++;
      if (b.count > rateLimit) { res.status(429).json({ error: "Too many requests" }); return; }
      next();
    });
  }

  // Structured request logging
  app.use((req, _res, next) => {
    console.error(JSON.stringify({ ts: Date.now(), method: req.method, path: req.path, ip: req.ip }));
    next();
  });

  const authToken = process.env.MCP_AUTH_TOKEN;
  if (authToken) {
    const guard = (req: any, res: any, next: any) => {
      const h = req.headers["authorization"] || "";
      if (h === `Bearer ${authToken}`) return next();
      res.status(401).json({ error: "Unauthorized" });
    };
    app.use("/mcp", guard);
    app.use("/sse", guard);
    app.use("/messages", guard);
  }

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

  app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() }));
  app.get("/metrics", (_req, res) => {
    res.type("text/plain").send(
      `# HELP desh_uptime_seconds Process uptime\n# TYPE desh_uptime_seconds gauge\ndesh_uptime_seconds ${process.uptime()}\n`
    );
  });

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.error(`MCP HTTP server listening on http://localhost:${port}/mcp`);
  });
}

process.on("SIGTERM", () => { console.error("SIGTERM received, shutting down"); process.exit(0); });
process.on("SIGINT", () => { console.error("SIGINT received, shutting down"); process.exit(0); });

if (transportMode === "stdio") {
  runStdio().catch((e) => { console.error(e); process.exit(1); });
} else if (transportMode === "http") {
  runHttp().catch((e) => { console.error(e); process.exit(1); });
} else {
  runHttp().catch((e) => console.error(e));
  runStdio().catch((e) => { console.error(e); process.exit(1); });
}