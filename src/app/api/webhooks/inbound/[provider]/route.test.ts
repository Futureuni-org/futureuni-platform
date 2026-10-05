/**
 * Phase 20 (SEC-3): the inbound-webhook token compare is constant-time and rejects a missing,
 * wrong, or differently-cased token.
 */

import { describe, expect, it } from "vitest";

import { tokenMatches } from "./route";

describe("inbound webhook token compare (SEC-3)", () => {
  it("accepts the exact token", () => {
    expect(tokenMatches("s3cret-token", "s3cret-token")).toBe(true);
  });

  it("rejects a wrong, differently-lengthed, or missing token", () => {
    expect(tokenMatches("wrong", "s3cret-token")).toBe(false);
    expect(tokenMatches("s3cret-toke", "s3cret-token")).toBe(false);
    expect(tokenMatches("", "s3cret-token")).toBe(false);
    expect(tokenMatches(null, "s3cret-token")).toBe(false);
  });
});
