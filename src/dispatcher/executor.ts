import { spawn } from "node:child_process";
import type { Agent } from "../types.js";

export interface ExecContext {
  signal: AbortSignal;
  timeoutMs: number;
}

export async function executeAgent(
  agent: Agent,
  input: unknown,
  ctx: ExecContext
): Promise<unknown> {
  switch (agent.config.kind) {
    case "process":
      return runProcess(agent, input, ctx);
    case "http":
      return runHttp(agent, input, ctx);
    case "llm":
      return runLlm(agent, input, ctx);
    default:
      throw new Error(`Unknown agent kind`);
  }
}

async function runProcess(agent: Agent, input: unknown, ctx: ExecContext): Promise<unknown> {
  const cfg = agent.config as any;
  const inputStr = typeof input === "string" ? input : JSON.stringify(input);
  return new Promise((resolve, reject) => {
    if (ctx.signal.aborted) return reject(new Error("Aborted"));
    const child = spawn(cfg.command, cfg.args ?? [], {
      cwd: cfg.cwd,
      env: { ...process.env, ...(cfg.env ?? {}) },
      shell: cfg.shell ?? false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Process timed out after ${ctx.timeoutMs}ms`));
    }, ctx.timeoutMs);
    const onAbort = () => {
      child.kill("SIGKILL");
      reject(new Error("Aborted"));
    };
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
      if (code !== 0) {
        reject(new Error(`Process exited ${code}: ${stderr || stdout}`));
        return;
      }
      const trimmed = stdout.trim();
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        resolve(trimmed);
      }
    });
    if (child.stdin) {
      child.stdin.write(inputStr);
      child.stdin.end();
    }
  });
}

async function runHttp(agent: Agent, input: unknown, ctx: ExecContext): Promise<unknown> {
  const cfg = agent.config as any;
  const method = cfg.method ?? "POST";
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(cfg.headers ?? {}) };
  const timeout = cfg.timeoutMs ?? ctx.timeoutMs;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(cfg.url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(input),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener("abort", onAbort);
  }
}

async function runLlm(agent: Agent, input: unknown, ctx: ExecContext): Promise<unknown> {
  const cfg = agent.config as any;
  const images = (typeof input === "object" && input !== null) ? ((input as any).images ?? []) : [];
  const prompt = typeof input === "string" ? input : ((input as any)?.text ?? JSON.stringify(input));
  const provider = cfg.provider;
  const apiKey = cfg.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? process.env.GEMINI_API_KEY ?? process.env.MISTRAL_API_KEY ?? process.env.COHERE_API_KEY;

  if (provider === "anthropic") {
    const baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, max_tokens: cfg.maxTokens ?? 1024, temperature: cfg.temperature ?? 0.7, system: cfg.systemPrompt, messages: [{ role: "user", content: prompt }] }),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return { text: data?.content?.[0]?.text, raw: data };
  }

  if (provider === "gemini") {
    const baseUrl = cfg.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const res = await fetch(`${baseUrl}/models/${cfg.model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], systemInstruction: cfg.systemPrompt ? { parts: [{ text: cfg.systemPrompt }] } : undefined }),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text, raw: data };
  }

  if (provider === "cohere") {
    const baseUrl = cfg.baseUrl ?? "https://api.cohere.ai/v1";
    const res = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, message: prompt, preamble: cfg.systemPrompt, temperature: cfg.temperature ?? 0.7 }),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`Cohere ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return { text: data?.text, raw: data };
  }

  // openai-compatible: openai, ollama, mistral, generic
  const baseUrl = cfg.baseUrl ?? (
    provider === "mistral" ? "https://api.mistral.ai/v1" :
    provider === "ollama" ? "http://localhost:11434/v1" :
    provider === "openai" ? "https://api.openai.com/v1" :
    "http://localhost:11434/v1"
  );
  const tools = cfg.enableTools ? [
    { type: "function", function: { name: "get_time", description: "Get current ISO time", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "run_shell", description: "Run a shell command and return output", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
    { type: "function", function: { name: "http_get", description: "HTTP GET a URL", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  ] : undefined;

  const userContent = images.length ? [{ type: "text", text: prompt }, ...images.map((u: string) => ({ type: "image_url", image_url: { url: u } }))] : prompt;
  const messages: any[] = [
    ...(cfg.systemPrompt ? [{ role: "system", content: cfg.systemPrompt }] : []),
    { role: "user", content: userContent },
  ];

  let lastData: any = null;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model: cfg.model, temperature: cfg.temperature ?? 0.7, max_tokens: cfg.maxTokens, messages, tools, tool_choice: tools ? "auto" : undefined }),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    lastData = data;
    const msg = data?.choices?.[0]?.message;
    if (!msg?.tool_calls || msg.tool_calls.length === 0) {
      return { text: msg?.content, raw: data };
    }
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const result = await runBuiltinTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  return { text: lastData?.choices?.[0]?.message?.content, raw: lastData };
}

async function runBuiltinTool(name: string, args: any): Promise<unknown> {
  if (name === "get_time") return { now: new Date().toISOString() };
  if (name === "run_shell") {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(exec);
    try {
      const { stdout, stderr } = await run(args.command, { timeout: 30000 });
      return { stdout, stderr };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }
  if (name === "http_get") {
    try {
      const r = await fetch(args.url);
      const text = await r.text();
      return { status: r.status, body: text.slice(0, 4000) };
    } catch (e: any) {
      return { error: e?.message ?? String(e) };
    }
  }
  return { error: "unknown tool" };
}