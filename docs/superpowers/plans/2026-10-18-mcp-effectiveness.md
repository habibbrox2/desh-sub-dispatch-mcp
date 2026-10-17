# MCP Server Effectiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the MCP surface up to mcp-builder quality (input descriptions, annotations, output schemas, structuredContent, prompts, actionable errors, paginated lists) and fix the state-ownership/test-isolation defects the audit found.

**Architecture:** Keep the Dispatcher/registry/store split. Add one injection point so a whole HTTP process owns a single Dispatcher; move express wiring into `src/http.ts`. Convert tool registration from deprecated `server.tool(...)` to `server.registerTool(name, config, cb)` (SDK 1.32.1, verified: `isError` results skip output validation, success requires `structuredContent` when `outputSchema` is set). Add a prompts module and a `Dispatcher.getStats()` owner for stats.

**Tech Stack:** TypeScript 5.7 strict / NodeNext, @modelcontextprotocol/sdk ^1.32.1, Zod ^3.24, Vitest 5 (in-memory transport + in-process HTTP for tool tests), esbuild CJS bundle.

**Spec:** `docs/superpowers/specs/2026-10-18-audit.md` — its gap list is the requirement source.

## Global Constraints
- Node >= 22; `npm run build` (tsc + esbuild → `dist/server.bundle.cjs`) stays error-free; no new runtime dependencies.
- All 16 existing tool names and their existing argument names stay unchanged (live clients).
- Tests must never open `./desh-sub-dispatch.db`; only `:memory:`.
- `MCP_AUTH_TOKEN`/CORS/rate-limit behavior unchanged.
- Version stays 0.2.0 (feature commit, not a release).
- `npx tsc --noEmit`, `npm run build`, `npm test` all green at every task gate.

## Review Focus
1. A success result from a tool with `outputSchema` but no `structuredContent` makes the SDK throw `InvalidParams` — every success path must return both (pinned by Task 4 test).
2. After Task 2, a second MCP session must observe agents registered through the first (cross-session single-dispatcher guarantee; pinned by Task 2 test — audit marked this unproven).
3. Bundle parity: the esbuild CJS bundle must advertise the same 16 tools + 3 prompts as source (pinned by Task 8 bundle smoke).
4. Backwards compatibility: tool *names* and arg *names* unchanged after the `registerTool` conversion (pinned by Task 4 test comparing to the fixed list below).
5. Pagination boundaries: `offset >= total` → empty `items`, correct `total`; `limit` integer 1–500 default 50; existing order preserved (pinned by Task 6 tests).

Recorded 16 tool names: `register_agent, unregister_agent, list_agents, get_agent, dispatch_task, dispatch_batch, dispatch_workflow, get_task_status, get_task_result, cancel_task, retry_task, list_tasks, get_dispatcher_stats, list_skills, get_skill, register_agent_from_skill`.

---

### Task 1: `createServer` forwards `dbPath` and accepts an injected dispatcher

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server.test.ts` (create)

**Interfaces:**
- Produces: `createServer(opts?: { maxConcurrency?: number; dbPath?: string; dispatcher?: Dispatcher }): { server: McpServer; dispatcher: Dispatcher }` — Task 2 relies on the `dispatcher` option; all tests rely on `dbPath`.
- Consumes: `new Dispatcher({ maxConcurrency, dbPath })` (existing).

- [ ] **Step 1: Write the failing tests** in `tests/server.test.ts`:
```ts
it("dbPath isolates two servers (memory db)", () => {
  const a = createServer({ dbPath: ":memory:" }).dispatcher;
  const b = createServer({ dbPath: ":memory:" }).dispatcher;
  a.registry.register({ name: "x", config: { kind: "process", command: "node" } as any });
  expect(b.registry.list().map((x) => x.name)).not.toContain("x");
});
it("returns the injected dispatcher", () => {
  const shared = new Dispatcher({ dbPath: ":memory:" });
  expect(createServer({ dispatcher: shared }).dispatcher).toBe(shared);
});
```
- [ ] **Step 2: Run to verify FAIL** — `npx vitest run tests/server.test.ts` → first test fails (both servers hit the real db file and share rows), second fails to compile at runtime (unknown option ignored → new instance).
- [ ] **Step 3: Implement** in `src/server.ts`: widen `opts` as in Interfaces; `const dispatcher = opts?.dispatcher ?? new Dispatcher({ maxConcurrency: opts?.maxConcurrency ?? 4, dbPath: opts?.dbPath });`
- [ ] **Step 4: Verify PASS** — `npx vitest run tests/server.test.ts`, then `npm test` (existing 2 tests must stay green and now run against `:memory:`).
- [ ] **Step 5: Commit** — `git add src/server.ts tests/server.test.ts && git commit -m "fix(server): forward dbPath and allow injected dispatcher"`

### Task 2: HTTP mode owns exactly one dispatcher

**Files:**
- Create: `src/http.ts` — `export function createHttpApp(deps: { createSession: () => { server: McpServer; dispatcher: Dispatcher } ... })` → simplest form: `export function createHttpApp(shared: { server: McpServer; dispatcher: Dispatcher }): express.Express` building all routes from `runHttp()` but creating per-session servers via `createServer({ dispatcher: shared.dispatcher })`.
- Modify: `src/index.ts` — `runHttp()` becomes `createHttpApp(createServer())` + `listen`.
- Test: `tests/http.test.ts` (create)

**Interfaces:**
- Consumes: `createServer({ dispatcher })` from Task 1.
- Produces: `createHttpApp(shared: { server: McpServer; dispatcher: Dispatcher }): express.Express` (Task 8 bundle smoke exercises the same wiring through `index.ts`).

- [ ] **Step 1: Write the failing HTTP test** (`tests/http.test.ts`): start `createHttpApp(createServer({ dbPath: ":memory:" }))` on port 0; open two MCP sessions over `fetch` (POST `/mcp` initialize, capture `mcp-session-id`, send `notifications/initialized`); session A `register_agent {name:"shared-agent"}`; session B `list_agents` → expect an entry named `shared-agent`. Helper `callTool(port, session, name, args)` parses the SSE `data:` line.
- [ ] **Step 2: Run to verify FAIL** — `npx vitest run tests/http.test.ts` → module not found (`src/http.ts` does not exist).
- [ ] **Step 3: Implement** — move the express/CORS/rate-limit/logging/auth/routes/health/dashboard code from `runHttp()` into `createHttpApp`, replacing `createServer()` calls inside `/mcp` and `/sse` handlers with `createServer({ dispatcher: shared.dispatcher })`; `index.ts` keeps transport selection + `app.listen`.
- [ ] **Step 4: Verify PASS** — `npx vitest run tests/http.test.ts` + `npm test`.
- [ ] **Step 5: Commit** — `git add src/http.ts src/index.ts tests/http.test.ts && git commit -m "fix(http): single shared dispatcher across MCP sessions"`

### Task 3: Actionable errors and pre-dispatch validation

**Files:**
- Modify: `src/tools/register.ts`
- Test: `tests/tools.test.ts` (create; exports `openSession()` helper: `new Client(...)`, `client.connect(new StreamableHTTPClientTransport)` — use in-memory: `InMemoryTransport.createLinkedPair()` with `createServer({ dbPath: ":memory:" })`)

**Interfaces:**
- Produces: local helper `toolError(message: string, hint: string): CallToolResult` in `register.ts` returning `{ content: [{ type: "text", text: \`${message}\nHint: ${hint}\` }], isError: true }` — reused by Task 4/6.
- Consumes: `dispatcher.registry.get(id)` to validate before submit.

- [ ] **Step 1: Write failing tests** (`tests/tools.test.ts`):
```ts
it("dispatch_task rejects unknown agent with a hint", async () => {
  const r = await client.callTool({ name: "dispatch_task", arguments: { agentId: "ghost-1", input: "x" } });
  expect(r.isError).toBe(true);
  const text = (r.content as any)[0].text;
  expect(text).toContain("ghost-1"); expect(text).toContain("list_agents");
});
it("get_skill unknown id points at list_skills", async () => {
  const r = await client.callTool({ name: "get_skill", arguments: { id: "nope" } });
  expect((r.content as any)[0].text).toMatch(/list_skills/);
});
```
- [ ] **Step 2: Run to verify FAIL** — dispatch succeeds (`pending`), skill text is `not found`.
- [ ] **Step 3: Implement** — `toolError` helper; validate `agentId` (and each batch/workflow `agentId`) against `dispatcher.registry.get` *before* submitting, returning `toolError(\`Unknown agent: ${id}\`, "call list_agents to see registered agent ids")`; not-found paths for `get_agent`, `get_skill`, `get_task_status`, `get_task_result` get hints naming the listing tool; wrap `register_agent`/`register_agent_from_skill` duplicate-id throws.
- [ ] **Step 4: Verify PASS** — `npx vitest run tests/tools.test.ts` + `npm test`.
- [ ] **Step 5: Commit** — `git add src/tools/register.ts tests/tools.test.ts && git commit -m "feat(tools): actionable error messages and pre-dispatch agent validation"`

### Task 4: Tool metadata — descriptions, annotations, outputSchema, structuredContent

**Files:**
- Modify: `src/tools/register.ts` (convert all 16 `server.tool` → `server.registerTool`)
- Test: `tests/tools.test.ts` (add)

**Interfaces:**
- Consumes: `toolError` from Task 3 (SDK verified: `isError` results skip output validation, so Task 3 tests keep passing).
- Produces: every tool has `title`, `description`, per-param `.describe()`, `annotations`, `outputSchema`, and every *success* callback returns `{ content, structuredContent }` with `content` text unchanged (pretty JSON).

**Annotation table (exact):**
| tools | annotations |
|---|---|
| `list_agents`, `get_agent`, `get_task_status`, `get_task_result`, `list_tasks`, `get_dispatcher_stats`, `list_skills`, `get_skill` | `{ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }` |
| `register_agent`, `register_agent_from_skill`, `retry_task`, `cancel_task`, `unregister_agent` | `{ readOnlyHint: false, destructiveHint: true (only unregister_agent, else false), idempotentHint: false, openWorldHint: false }` |
| `dispatch_task`, `dispatch_batch`, `dispatch_workflow` | `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }` |

**Output shapes (exact):** `unregister_agent` → `{ ok: boolean }`; `dispatch_task`/`cancel_task`/`retry_task` → `{ id: z.string(), status: z.string() }` (`dispatch_task` keeps `taskId` key as today); `dispatch_batch` → `{ tasks: [{ taskId, status }] }`; `dispatch_workflow` → `{ keyToId: z.record(z.string()) }`; `list_*` → `z.object({ items: z.array(z.any()), total: z.number(), limit: z.number(), offset: z.number() })` (Task 6; skills lists can add limit/offset too or use `{ items, total }` envelope only if already adding — see Task 6); agent/skill/status/result/stats payloads → `z.record(z.any())`.

- [ ] **Step 1: Write failing tests** — `client.listTools()`: exactly the 16 recorded names; every tool has `annotations` and `outputSchema`; `dispatch_task.inputSchema.properties.agentId.description` is a non-empty string. `callTool("get_dispatcher_stats")` returns `structuredContent` with numeric `maxConcurrency`.
- [ ] **Step 2: Run to verify FAIL** — annotations undefined, outputSchema false.
- [ ] **Step 3: Implement** — convert each registration: `server.registerTool(name, { title, description, inputSchema: { ...zodFields with .describe() }, outputSchema, annotations }, cb)`; wrap every success return through one local helper `ok(data)` = `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data }`.
- [ ] **Step 4: Verify PASS** — `npx vitest run tests/tools.test.ts` (includes Task 3 tests) + `npm test`.
- [ ] **Step 5: Commit** — `git add src/tools/register.ts tests/tools.test.ts && git commit -m "feat(tools): annotations, output schemas and structuredContent for all tools"`

### Task 5: Implement the advertised prompts capability

**Files:**
- Create: `src/tools/prompts.ts` — `export function registerPrompts(server: McpServer): void`
- Modify: `src/server.ts` — call `registerPrompts(server)` next to `registerTools`
- Test: `tests/tools.test.ts` (add)

**Interfaces:**
- Produces: prompts `dispatch-task` (required arg `goal`), `dag-workflow` (required arg `workflow`), `monitor-fleet` (no args). Content: a recipe that tells the agent to call this server's own tools — `dispatch-task` = list_skills → register_agent_from_skill → dispatch_task → get_task_result(wait); `dag-workflow` = dispatch_workflow with `key`/`dependsOn` keys then poll get_task_status; `monitor-fleet` = get_dispatcher_stats/list_tasks + retry_task/cancel_task guidance.

- [ ] **Step 1: Write failing tests** — `client.listPrompts()` → names exactly `["dispatch-task","dag-workflow","monitor-fleet"]`; `client.getPrompt({ name: "dispatch-task", arguments: { goal: "x" } })` → ≥1 message whose text contains `dispatch_task`.
- [ ] **Step 2: Run to verify FAIL** — `-32601`.
- [ ] **Step 3: Implement** with `server.prompt(name, description, { ...z.string() }, cb)` returning `{ messages: [{ role: "user", content: { type: "text", text } }] }`.
- [ ] **Step 4: Verify PASS** — tests + `npm test`.
- [ ] **Step 5: Commit** — `git add src/tools/prompts.ts src/server.ts tests/tools.test.ts && git commit -m "feat(mcp): implement dispatch-task, dag-workflow and monitor-fleet prompts"`

### Task 6: Paginated lists + `Dispatcher.getStats()`

**Files:**
- Modify: `src/dispatcher/dispatcher.ts` (add `getStats()`), `src/tools/register.ts` (`list_agents`, `list_tasks`)
- Test: `tests/tools.test.ts` (add)

**Interfaces:**
- Produces: `Dispatcher.getStats(): { maxConcurrency: number; active: number; tasks: number; agents: number }` — `list_agents`/`list_tasks` gain `limit` (int 1–500, default 50) and `offset` (int ≥0, default 0) and return the `{ items, total, limit, offset }` envelope (Task 4 schema); existing filters (`kind`, `tag`, `status`, `agentId`) unchanged; existing item order unchanged.

- [ ] **Step 1: Write failing tests** — register 7 agents → `list_agents {limit:3, offset:3}` → `items.length 3, total 7`; `offset:100` → `items.length 0, total 7`; `get_dispatcher_stats` → `structuredContent.maxConcurrency` equals the server's (typecheck-clean, no `any` casts).
- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** — `getStats()` on Dispatcher; slice logic `items = all.slice(offset, offset + limit)` inside the tools; remove `(dispatcher as any)` casts.
- [ ] **Step 4: Verify PASS** — tests + `npm test`.
- [ ] **Step 5: Commit** — `git add src/dispatcher/dispatcher.ts src/tools/register.ts tests/tools.test.ts && git commit -m "feat(lists): limit/offset pagination and Dispatcher.getStats()"`

### Task 7: Docs sync

**Files:**
- Modify: `README.md`, `README.bn.md` — add a short **Prompts** section (the 3 prompts + arg names) and note `limit`/`offset` on `list_agents`/`list_tasks`; keep both files structurally identical (AGENTS.md consistency check). No other doc changes.

- [ ] **Step 1: Edit both READMEs** with the same two additions (English / বাংলা).
- [ ] **Step 2: Verify consistency** — `diff <(grep -o '^## .*' README.md) <(grep -o '^## .*' README.bn.md)` returns no differences beyond the language word itself (same heading set).
- [ ] **Step 3: Commit** — `git add README.md README.bn.md && git commit -m "docs: document prompts and list pagination"`

### Task 8: Full verification, report, commit and push

- [ ] **Step 1: Static gates** — `npx tsc --noEmit`, `npm run build`, `npm test` all exit 0.
- [ ] **Step 2: Bundle smoke (real surface)** — start `PORT=4574 node dist/server.bundle.cjs --http`; assert `/health` 200; `tools/list` → 16 names, 16 annotations, 16 outputSchema, non-empty param descriptions on `dispatch_task`; `prompts/list` → 3 prompts; end-to-end register→dispatch→`get_task_result wait` → `succeeded` with correct output (`structuredContent` present); kill server.
- [ ] **Step 3: Git hygiene** — `git status`; stage only the task files + rebuilt `dist/` (repo tracks `dist/` by convention); never stage `.freebuff/`.
- [ ] **Step 4: Commit + push** — conventional message `feat(mcp): tool metadata, prompts, actionable errors, pagination, shared dispatcher`; `git push origin main` (note: this triggers the Fly deploy workflow).