// src/http.ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "./server.js";
// Load the shared homepage HTML (same design as GitHub Pages)
function loadHomeHtml() {
    const candidates = [
        join(process.cwd(), "docs", "index.html"),
        join(process.cwd(), "index.html"),
        join(process.cwd(), "..", "docs", "index.html"),
    ];
    for (const c of candidates) {
        try {
            if (existsSync(c))
                return readFileSync(c, "utf8");
        }
        catch { }
    }
    return "<!DOCTYPE html><html><head><title>DeshSubDispatch</title></head><body><h1>DeshSubDispatch</h1><p>MCP server. See /health and /mcp.</p></body></html>";
}
const HOME_HTML = loadHomeHtml();
/**
 * Builds the express app. The process owns ONE Dispatcher (via the shared
 * dispatcher); every MCP/SSE session gets its own McpServer bound to that same
 * dispatcher, so agents and tasks are visible across sessions.
 */
export function createHttpApp(opts) {
    const shared = createServer(opts);
    const newSessionServer = () => createServer({ dispatcher: shared.dispatcher }).server;
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    // CORS
    const corsOrigin = process.env.CORS_ORIGIN ?? "*";
    app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", corsOrigin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Mcp-Session-Id,Accept");
        if (req.method === "OPTIONS") {
            res.status(204).end();
            return;
        }
        next();
    });
    // Simple rate limiter (per IP)
    const rateLimit = Number(process.env.RATE_LIMIT_PER_MIN ?? 0);
    const buckets = new Map();
    if (rateLimit > 0) {
        app.use((req, res, next) => {
            const ip = req.ip || "unknown";
            const now = Date.now();
            let b = buckets.get(ip);
            if (!b || now > b.reset) {
                b = { count: 0, reset: now + 60000 };
                buckets.set(ip, b);
            }
            b.count++;
            if (b.count > rateLimit) {
                res.status(429).json({ error: "Too many requests" });
                return;
            }
            next();
        });
    }
    // Structured request logging
    app.use((req, _res, next) => {
        console.error(JSON.stringify({ ts: Date.now(), method: req.method, path: req.path, ip: req.ip }));
        next();
    });
    const authToken = process.env.MCP_AUTH_TOKEN;
    const bearerMatches = (header, token) => {
        if (typeof header !== "string" || !header.startsWith("Bearer "))
            return false;
        const a = createHash("sha256").update(header.slice(7)).digest();
        const b = createHash("sha256").update(token).digest();
        return timingSafeEqual(a, b);
    };
    if (authToken) {
        const guard = (req, res, next) => {
            if (bearerMatches(req.headers["authorization"], authToken))
                return next();
            res.status(401).json({ error: "Unauthorized" });
        };
        app.use("/mcp", guard);
        app.use("/sse", guard);
        app.use("/messages", guard);
    }
    const sessions = new Map();
    app.post("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId && sessions.has(sessionId)) {
            const s = sessions.get(sessionId);
            await s.transport.handleRequest(req, res, req.body);
            return;
        }
        const server = newSessionServer();
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
                sessions.set(sid, { transport, server });
            },
        });
        transport.onclose = () => {
            if (transport.sessionId)
                sessions.delete(transport.sessionId);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    app.get("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId || !sessions.has(sessionId)) {
            res.status(400).send("Invalid session");
            return;
        }
        const s = sessions.get(sessionId);
        await s.transport.handleRequest(req, res);
    });
    app.delete("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId && sessions.has(sessionId)) {
            const s = sessions.get(sessionId);
            await s.transport.handleRequest(req, res);
            sessions.delete(sessionId);
        }
        else {
            res.status(404).send("not found");
        }
    });
    // Legacy SSE transport for older clients
    const sseSessions = new Map();
    app.get("/sse", async (_req, res) => {
        const server = newSessionServer();
        const transport = new SSEServerTransport("/messages", res);
        sseSessions.set(transport.sessionId, transport);
        res.on("close", () => sseSessions.delete(transport.sessionId));
        await server.connect(transport);
    });
    app.post("/messages", async (req, res) => {
        const sessionId = req.query.sessionId;
        const transport = sseSessions.get(sessionId);
        if (!transport) {
            res.status(404).send("session not found");
            return;
        }
        await transport.handlePostMessage(req, res, req.body);
    });
    app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime(), timestamp: Date.now() }));
    app.get("/metrics", (_req, res) => {
        res.type("text/plain").send(`# HELP desh_uptime_seconds Process uptime\n# TYPE desh_uptime_seconds gauge\ndesh_uptime_seconds ${process.uptime()}\n`);
    });
    app.get("/", (_req, res) => res.type("html").send(HOME_HTML));
    app.get("/dashboard", (_req, res) => res.type("html").send(HOME_HTML));
    return app;
}
//# sourceMappingURL=http.js.map