# 🇧🇩 DeshSubDispatch — Bangladesh's Open Source MCP Server

> **DeshSubDispatch** is a fully self-contained Model Context Protocol (MCP) server that connects to any coding agent and dispatches & orchestrates hybrid sub-agents (LLM, process, HTTP).

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![Made in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh-red)

> 🇧🇩 [বাংলা README](./README.bn.md) | 📖 [GitHub Pages](https://habibbrox2.github.io/desh-sub-dispatch-mcp/) | 🚀 [Live (Fly.io)](https://deshdsp.fly.dev)

---

## ✨ Features

- 🔀 **Hybrid agents**: LLM (OpenAI/Anthropic/Generic), process (child process), HTTP (remote endpoint)
- 🧠 **Full orchestration**: priority queue, concurrency limits, dependencies (DAG workflows), retries, timeouts, cancellation
- 🧩 **Skill presets**: ready-made skills (coder, researcher, summarizer, claude-coder, etc.)
- 🌐 **Universal compatibility**: stdio, Streamable HTTP, and legacy SSE transports
- 📦 **Fully self-contained**: single bundle file, no `node_modules` required
- 🇧🇩 **Built for Bangladesh**: by Bangladeshi developers, for the world

---

## 🔌 Configuration

### Public MCP Endpoint (No Auth — Free for Everyone)

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Local stdio

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "command": "node",
      "args": ["/path/to/dist/server.bundle.cjs"]
    }
  }
}
```

### Local HTTP

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## 📦 Install in Other MCP Hosts

### Cursor

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### OpenCode

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Windsurf

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Zed

```json
{
  "context_servers": {
    "DeshSubDispatch": {
      "server": {
        "type": "http",
        "url": "https://deshdsp.fly.dev/mcp"
      }
    }
  }
}
```

### GitHub Copilot CLI

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### GitHub Copilot in IDEs (JetBrains, Visual Studio, Eclipse, Xcode)

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Codex (OpenAI)

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Rovo Dev CLI

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### VS Code

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

### Cline / Continue

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp"
    }
  }
}
```

---

## ⚡ Quick Start

```bash
# Build
npm install
npm run build

# stdio (default)
node dist/server.bundle.cjs

# HTTP
TRANSPORT=http PORT=3000 node dist/server.bundle.cjs

# Ready-to-paste config
node dist/server.bundle.cjs --print-config
```

---

## 🔑 No API Key Required

This MCP server works out of the box without any API key. Process agents and HTTP agents run without external credentials. LLM agents (OpenAI, Anthropic, etc.) only need an API key if you choose to use them.

`MCP_AUTH_TOKEN` is **optional** — when set, it protects the HTTP `/mcp` endpoint with Bearer token auth. When not set (default), the endpoint is open.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `3000` | HTTP port |
| `MCP_AUTH_TOKEN` | (none) | Bearer token required for `/mcp`, `/sse`, `/messages` when set |
| `DESH_DB_PATH` | `./desh-sub-dispatch.db` | SQLite database path |
| `CORS_ORIGIN` | `*` | CORS allowed origin |
| `RATE_LIMIT_PER_MIN` | `0` (disabled) | Per-IP rate limit |

## Live Deployment

| Endpoint | URL |
|----------|-----|
| MCP | `https://deshdsp.fly.dev/mcp` |
| Health | `https://deshdsp.fly.dev/health` |
| Homepage | `https://deshdsp.fly.dev` |
| GitHub Pages | `https://habibbrox2.github.io/desh-sub-dispatch-mcp/` |
| GitHub Release | `https://github.com/habibbrox2/desh-sub-dispatch-mcp/releases/tag/v0.2.0` |

---

## 🛠️ Main Tools

| Tool | Description |
|------|-------------|
| `register_agent` | Register a new agent |
| `unregister_agent` | Remove a registered agent |
| `list_agents` / `get_agent` | List (paginated: `limit`/`offset`, default 50, max 500) / inspect agents |
| `dispatch_task` | Dispatch a single task |
| `dispatch_batch` | Dispatch multiple tasks at once |
| `dispatch_workflow` | DAG workflow |
| `get_task_status` / `get_task_result` | Status & result (with wait support) |
| `cancel_task` / `retry_task` | Cancel & retry |
| `list_tasks` / `get_dispatcher_stats` | Task list (paginated: `limit`/`offset`) & dispatcher stats |
| `list_skills` / `get_skill` | List / inspect skills |
| `register_agent_from_skill` | Create an agent from a skill preset |

Tool results are returned both as JSON text and as `structuredContent`, validated against declared output schemas.

---

## 💬 Prompts

Three MCP prompts (via `prompts/list`) teach the client how to drive this server:

| Prompt | Arguments | What it does |
|--------|-----------|--------------|
| `dispatch-task` | `goal` | Pick a skill → register an agent → `dispatch_task` → wait with `get_task_result` |
| `dag-workflow` | `workflow` | Split work into a DAG → `dispatch_workflow` → track each node, retry/cancel as needed |
| `monitor-fleet` | (none) | `get_dispatcher_stats` → find stuck/failed tasks → `retry_task` / `cancel_task` |

---

## 🧩 Agent Types

- **llm**: `{ kind, provider: openai|anthropic|generic, model, apiKey?, baseUrl?, systemPrompt?, temperature?, maxTokens? }`
- **process**: `{ kind, command, args?, cwd?, env?, shell? }`
- **http**: `{ kind, url, method?, headers?, timeoutMs? }`

---

## 🇧🇩 Bangladesh Open Source Contribution

DeshSubDispatch is an open-source initiative for the Bangladeshi developer community. We believe technology should be open to all. Contributions, issue reports, and pull requests are welcome.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

MIT © Habibur Rahman — Bangladesh 🇧🇩

---

> *"Technology for everyone, in everyone's hands"* — DeshSubDispatch
