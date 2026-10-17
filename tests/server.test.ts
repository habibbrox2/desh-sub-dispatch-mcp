import { describe, it, expect } from "vitest";
import { createServer } from "../src/server.js";
import { Dispatcher } from "../src/dispatcher/dispatcher.js";

describe("createServer options", () => {
  it("dbPath isolates two servers (memory db)", () => {
    const a = createServer({ dbPath: ":memory:" }).dispatcher;
    a.registry.register({ name: "x", config: { kind: "process", command: "node" } as any });
    // b is constructed AFTER a's write: with a real shared file it would load "x".
    const b = createServer({ dbPath: ":memory:" }).dispatcher;
    expect(b.registry.list().map((x) => x.name)).not.toContain("x");
  });

  it("returns the injected dispatcher", () => {
    const shared = new Dispatcher({ dbPath: ":memory:" });
    expect(createServer({ dispatcher: shared }).dispatcher).toBe(shared);
  });
});