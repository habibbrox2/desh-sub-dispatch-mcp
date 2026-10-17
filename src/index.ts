// src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { createHttpApp } from "./http.js";

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

function runHttp() {
  const app = createHttpApp();
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
  try { runHttp(); } catch (e) { console.error(e); process.exit(1); }
} else {
  try { runHttp(); } catch (e) { console.error(e); }
  runStdio().catch((e) => { console.error(e); process.exit(1); });
}