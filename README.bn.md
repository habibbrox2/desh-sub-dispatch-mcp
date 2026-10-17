# 🇧🇩 DeshSubDispatch — বাংলাদেশের Open Source MCP Server

> **DeshSubDispatch** হলো একটি সম্পূর্ণ self-contained Model Context Protocol (MCP) server যা যেকোনো coding agent-এর সাথে কানেক্ট হয়ে hybrid sub-agents (LLM, process, HTTP) dispatch ও orchestrate করে।

![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![Made in Bangladesh](https://img.shields.io/badge/Made%20in-Bangladesh-red)

> 🇧🇩 [English README](./README.md) | 📖 [GitHub Pages](https://habibbrox2.github.io/desh-sub-dispatch-mcp/) | 🚀 [Live (Fly.io)](https://deshdsp.fly.dev)

---

## ✨ ফিচারসমূহ

- 🔀 **Hybrid agents**: LLM (OpenAI/Anthropic/Generic), process (child process), HTTP (remote endpoint)
- 🧠 **Full orchestration**: priority queue, concurrency limits, dependencies (DAG workflows), retries, timeouts, cancellation
- 🧩 **Skill presets**: ready-made skills (coder, researcher, summarizer, claude-coder, etc.)
- 🌐 **Universal compatibility**: stdio, Streamable HTTP, এবং legacy SSE transports
- 📦 **Fully self-contained**: single bundle file, `node_modules` লাগবে না
- 🇧🇩 **বাংলাদেশের জন্য**: বাংলাদেশি developers দ্বারা, বিশ্বের জন্য

---

## 🔌 কনফিগারেশন

### Hosted MCP Endpoint (Bearer auth প্রয়োজন)

হোস্ট করা endpoint-এ ডিফল্টে authentication আছে। সার্ভারে `MCP_AUTH_TOKEN` সেট করুন
এবং ক্লায়েন্ট সাপোর্ট করলে header হিসেবে পাঠান:

```json
{
  "mcpServers": {
    "DeshSubDispatch": {
      "type": "http",
      "url": "https://deshdsp.fly.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN" }
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

## 📦 অন্যান্য MCP Host-এ ইনস্টল

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

## 🔑 কোনো API Key লাগবে না

সার্ভার চালাতে কোনো API key লাগে না। Process agents এবং HTTP agents কোনো external credentials ছাড়াই চলে; LLM agents (OpenAI, Anthropic, etc.) শুধু ব্যবহার করলেই API key লাগে।

HTTP mode এখন **ডিফল্টে authenticated**: `/mcp`, `/sse` এবং `/messages`-এ `Authorization: Bearer <token>` লাগে। `MCP_AUTH_TOKEN` সেট না থাকলে শুরুতে একটি random per-process টোকেন generate করে stderr-এ লগ করা হয়। স্থিতিশীল টোকেনের জন্য `MCP_AUTH_TOKEN` সেট করুন, অথবা `MCP_ALLOW_ANONYMOUS=1` দিয়ে টোকেন ছাড়াই এন্ডপয়েন্ট খোলা রাখুন (পাবলিক ইন্টারনেটে এটি সুপারিশযোগ্য নয়)। লোকাল `stdio` মোডে কোনো টোকেন লাগে না।

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `3000` | HTTP port |
| `MCP_AUTH_TOKEN` | (auto-generated) | `/mcp`, `/sse`, `/messages`-এর Bearer টোকেন; সেট না থাকলে শুরুতে random per-process টোকেন generate করে লগ হয় |
| `MCP_ALLOW_ANONYMOUS` | `0` | `1` দিলে MCP endpoints Bearer auth ছাড়াই চলবে (`MCP_AUTH_TOKEN` সেট থাকলে উপেক্ষা করা হয়) |
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

## 🛠️ মূল টুলসমূহ

| Tool | Description |
|------|-------------|
| `register_agent` | Register a new agent |
| `unregister_agent` | Remove a registered agent |
| `list_agents` / `get_agent` | List (pagination: `limit`/`offset`, default 50, max 500) / inspect agents |
| `dispatch_task` | Dispatch a single task |
| `dispatch_batch` | Dispatch multiple tasks at once |
| `dispatch_workflow` | DAG workflow |
| `get_task_status` / `get_task_result` | Status & result (with wait support) |
| `cancel_task` / `retry_task` | Cancel & retry |
| `list_tasks` / `get_dispatcher_stats` | Task list (pagination: `limit`/`offset`) ও dispatcher stats |
| `list_skills` / `get_skill` | List / inspect skills |
| `register_agent_from_skill` | Create an agent from a skill preset |

Tool results JSON text এবং `structuredContent` — দুটোভাবেই আসে, এবং output schema দিয়ে validate হয়।

---

## 💬 Prompts

`prompts/list`-এ তিনটি MCP prompt আছে — এই সার্ভার কীভাবে ব্যবহার করতে হয় সেগুলো দেখায়:

| Prompt | Arguments | কী করে |
|--------|-----------|--------|
| `dispatch-task` | `goal` | Skill বেছে নেওয়া → agent register → `dispatch_task` → `get_task_result` দিয়ে অপেক্ষা |
| `dag-workflow` | `workflow` | কাজকে DAG-এ ভাগ → `dispatch_workflow` → প্রতিটি node ট্র্যাক, প্রয়োজনে retry/cancel |
| `monitor-fleet` | (নেই) | `get_dispatcher_stats` → আটকে/ব্যর্থ task খোঁজা → `retry_task` / `cancel_task` |

---

## 🧩 Agent Types

- **llm**: `{ kind, provider: openai|anthropic|generic, model, apiKey?, baseUrl?, systemPrompt?, temperature?, maxTokens? }`
- **process**: `{ kind, command, args?, cwd?, env?, shell? }`
- **http**: `{ kind, url, method?, headers?, timeoutMs? }`

---

## 🇧🇩 বাংলাদেশ Open Source Contribution

DeshSubDispatch হলো বাংলাদেশি developer কমিউনিটির জন্য open-source initiative। আমরা বিশ্বাস করি প্রযুক্তি সবার জন্য উন্মুক্ত হওয়া উচিত। Contributions, issue reports, এবং pull requests স্বাগতম।

### কিভাবে অবদান রাখবেন

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
