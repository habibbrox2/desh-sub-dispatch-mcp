# Claude Code integration

Register this MCP server in Claude Code via `.mcp.json` (project) or `~/.claude.json`:

```json
{
  "mcpServers": {
    "sub-agent-dispatcher": {
      "command": "node",
      "args": ["/public/sub-agent-dispatcher-mcp/dist/index.js"]
    }
  }
}
```

For HTTP transport:

```json
{
  "mcpServers": {
    "sub-agent-dispatcher": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Then use tools like `register_agent_from_skill` with `skillId=claude-coder`.


## Live deployment

Hosted MCP endpoint: https://deshdsp.fly.dev/mcp
Health: https://deshdsp.fly.dev/health
