# DeshSubDispatch — Sub-Agent Dispatcher MCP Server

> 🇧🇩 [বাংলা README](./README.bn.md)

Hybrid sub-agent dispatcher with full orchestration (dependencies, retries, timeouts, priority, concurrency).

## Install & Build

```bash
npm install
npm run build
```

## Run

- stdio (default): `node dist/index.js`
- HTTP: `TRANSPORT=http PORT=3000 node dist/index.js` or `node dist/index.js --http`
- Both: `node dist/index.js --both`

## Tools

- register_agent / unregister_agent / list_agents / get_agent
- dispatch_task / dispatch_batch / dispatch_workflow
- get_task_status / get_task_result / cancel_task / retry_task
- list_tasks / get_dispatcher_stats

## Agent kinds

- llm: { kind, provider: openai|anthropic|generic, model, apiKey?, baseUrl?, systemPrompt?, temperature?, maxTokens? }
- process: { kind, command, args?, cwd?, env?, shell? }
- http: { kind, url, method?, headers?, timeoutMs? }

## Connect to any coding agent

This server speaks standard MCP over **stdio**, **Streamable HTTP**, and **legacy SSE**, so it works with Claude Code, Cursor, Windsurf, Cline, Continue, Zed, VS Code Copilot, OpenCode, and others.

- stdio: `node dist/index.js`
- HTTP: `TRANSPORT=http PORT=3000 node dist/index.js` (endpoints: `/mcp`, `/sse`, `/messages`, `/health`)
- Print a ready-to-paste MCP config: `node dist/index.js --print-config`

### Quick configs

Cursor / Windsurf / Cline / Continue / Zed / VS Code (stdio):
```json
{ "mcpServers": { "sub-agent-dispatcher": { "command": "node", "args": ["/path/to/dist/index.js"] } } }
```

OpenCode:
```json
{ "mcp": { "sub-agent-dispatcher": { "type": "local", "command": ["node", "/path/to/dist/index.js"] } } }
```
EOF