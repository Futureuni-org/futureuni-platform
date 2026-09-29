import { describe, expect, it } from "vitest";

import { redact } from "./redact";

describe("audit redact", () => {
  it("redacts obvious secret keys, case-insensitively", () => {
    const input = {
      email: "alice@example.com",
      password: "hunter2",
      apiKey: "sk-live-xyz",
      TOKEN: "abc",
      ciphertext: "AA==",
      nested: { refreshToken: "rt", clientId: "keep" },
    };
    const out = redact(input);
    expect(out).toEqual({
      email: "alice@example.com",
      password: "[REDACTED]",
      apiKey: "[REDACTED]",
      TOKEN: "[REDACTED]",
      ciphertext: "[REDACTED]",
      nested: { refreshToken: "[REDACTED]", clientId: "keep" },
    });
  });

  it("walks arrays and objects without mutating the input", () => {
    const input = { list: [{ password: "a" }, { name: "ok" }] };
    const out = redact(input);
    expect(input.list[0]?.password).toBe("a");
    expect(out).toEqual({ list: [{ password: "[REDACTED]" }, { name: "ok" }] });
  });

  it("handles nulls and primitives", () => {
    expect(redact(null)).toBeNull();
    expect(redact("plain")).toBe("plain");
    expect(redact(42)).toBe(42);
  });

  it("caps recursion depth", () => {
    interface Nested { child?: Nested; leaf?: string }
    const root: Nested = {};
    let node: Nested = root;
    for (let i = 0; i < 40; i += 1) {
      const child: Nested = {};
      node.child = child;
      node = child;
    }
    node.leaf = "end";
    expect(() => redact(root)).not.toThrow();
  });
});
