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
  const apiKey = cfg.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  const prompt = typeof input === "string" ? input : JSON.stringify(input);
  const provider = cfg.provider;
  if (provider === "anthropic") {
    const baseUrl = cfg.baseUrl ?? "https://api.anthropic.com";
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens ?? 1024,
        temperature: cfg.temperature ?? 0.7,
        system: cfg.systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    const text = data?.content?.[0]?.text;
    return { text, raw: data };
  }
  const baseUrl = cfg.baseUrl ?? (provider === "openai" ? "https://api.openai.com/v1" : "http://localhost:11434/v1");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: cfg.temperature ?? 0.7,
      max_tokens: cfg.maxTokens,
      messages: [
        ...(cfg.systemPrompt ? [{ role: "system", content: cfg.systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
    }),
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return { text, raw: data };
}