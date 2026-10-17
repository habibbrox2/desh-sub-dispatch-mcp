import { describe, it, expect } from "vitest";
import { checkWebhookUrl } from "../src/security.js";
import { BUILTIN_LLM_TOOLS, runBuiltinTool } from "../src/dispatcher/executor.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
const privateLookup = async () => [{ address: "10.0.0.5", family: 4 }];
const failedLookup = async (): Promise<Array<{ address: string; family: number }>> => {
  throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
};

describe("webhook SSRF policy", () => {
  it("rejects non-http protocols", async () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com/x", "gopher://x/"]) {
      const r = await checkWebhookUrl(u, publicLookup);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects loopback, private, link-local and metadata literal addresses", async () => {
    const urls = [
      "http://127.0.0.1/hook",
      "http://10.1.2.3/hook",
      "http://172.16.5.5/hook",
      "http://172.31.9.9/hook",
      "http://192.168.0.10/hook",
      "http://169.254.169.254/latest/meta-data",
      "http://100.64.1.1/hook",
      "http://0.0.0.0/hook",
      "http://[::1]/hook",
      "http://[fd00::1]/hook",
      "http://[fe80::1]/hook",
      "http://[::ffff:127.0.0.1]/hook",
    ];
    for (const u of urls) {
      const r = await checkWebhookUrl(u, publicLookup);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects localhost and internal hostnames without consulting DNS", async () => {
    const urls = [
      "http://localhost/hook",
      "http://host.localhost/hook",
      "http://db.internal/hook",
      "http://printer.local/hook",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://router.home.arpa/hook",
    ];
    for (const u of urls) {
      const r = await checkWebhookUrl(u, publicLookup);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rejects hostnames that resolve to private addresses or fail to resolve", async () => {
    expect((await checkWebhookUrl("https://hooks.example.com/x", privateLookup)).ok).toBe(false);
    expect((await checkWebhookUrl("https://hooks.example.com/x", failedLookup)).ok).toBe(false);
  });

  it("allows public http(s) endpoints", async () => {
    expect((await checkWebhookUrl("https://example.com/hook", publicLookup)).ok).toBe(true);
    expect((await checkWebhookUrl("http://93.184.216.34:8080/hook", publicLookup)).ok).toBe(true);
  });

  it("rejects invalid URLs and embedded credentials", async () => {
    expect((await checkWebhookUrl("not a url", publicLookup)).ok).toBe(false);
    expect((await checkWebhookUrl("https://user:pass@example.com/x", publicLookup)).ok).toBe(false);
  });
});

describe("run_shell retirement", () => {
  it("is no longer offered to LLM agents", () => {
    expect(BUILTIN_LLM_TOOLS.map((t) => t.function.name)).not.toContain("run_shell");
    expect(BUILTIN_LLM_TOOLS.map((t) => t.function.name)).toContain("get_time");
  });

  it("returns a disabled error without executing anything", async () => {
    const r: any = await runBuiltinTool("run_shell", { command: "echo pwned" });
    expect(r.error).toMatch(/removed|disabled/i);
    expect(r.stdout).toBeUndefined();
  });
});