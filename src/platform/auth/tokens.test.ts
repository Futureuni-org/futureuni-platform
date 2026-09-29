import { describe, expect, it } from "vitest";

import { hashToken, newToken } from "./tokens";

describe("tokens", () => {
  it("hashes tokens deterministically with SHA-256 hex", () => {
    const hash = hashToken("some-plaintext");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken("some-plaintext")).toBe(hash);
  });

  it("hashes differ per plaintext", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("newToken returns unique plain + matching hash", () => {
    const a = newToken();
    const b = newToken();
    expect(a.plain).not.toBe(b.plain);
    expect(hashToken(a.plain)).toBe(a.hash);
    expect(hashToken(b.plain)).toBe(b.hash);
    // 32-byte base64url ≈ 43 characters (no padding).
    expect(a.plain.length).toBeGreaterThanOrEqual(40);
  });
});
