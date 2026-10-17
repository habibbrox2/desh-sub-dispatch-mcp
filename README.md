# 🇧🇩 DeshSubDispatch — Bangladesh's Open Source MCP Server

> **DeshSubDispatch** is a fully self-contained Model Context Protocol (MCP) server that connects to any coding agent and dispatches & orchestrates hybrid sub-agents (LLM, process, HTTP).

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![Made in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh-red)

> 🇧🇩 [বাংলা README](./README.bn.md) | 🌐 [GitHub Pages](https://habibbrox2.github.io/desh-sub-dispatch-mcp/)

---

## ✨ Features

- 🔀 **Hybrid agents**: LLM (OpenAI/Anthropic/Generic), process (child process), HTTP (remote endpoint)
- 🧠 **Full orchestration**: priority queue, concurrency limits, dependencies (DAG workflows), retries, timeouts, cancellation
- 🧩 **Skill presets**: ready-made skills (coder, researcher, summarizer, claude-coder, etc.)
- 🌐 **Universal compatibility**: stdio, Streamable HTTP, and legacy SSE transports
- 📦 **Fully self-contained**: single bundle file, no `node_modules` required
- 🇧🇩 **Built for Bangladesh**: by Bangladeshi developers, for the world

---

## 🚀 Quick Start

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

## 🔌 Connect to Any Coding Agent

Works with Cursor, Windsurf, Cline, Continue, Zed, VS Code, Claude Code, OpenCode, and more.

stdio config:

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

HTTP mode (endpoints: `/mcp`, `/sse`, `/messages`, `/health`):

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

## 🛠️ Main Tools

| Tool | Description |
|------|-------------|
| `register_agent` | Register a new agent |
| `register_agent_from_skill` | Create an agent from a skill preset |
| `list_skills` / `get_skill` | List / inspect skills |
| `dispatch_task` | Dispatch a single task |
| `dispatch_batch` | Dispatch multiple tasks at once |
| `dispatch_workflow` | DAG workflow |
| `get_task_status` / `get_task_result` | Status & result (with wait support) |
| `cancel_task` / `retry_task` | Cancel & retry |
| `list_tasks` / `get_dispatcher_stats` | Task list & stats |

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

## 📜 License

MIT © Habibur Rahman — Bangladesh 🇧🇩

---

> *"Technology for everyone, in everyone's hands"* — DeshSubDispatch