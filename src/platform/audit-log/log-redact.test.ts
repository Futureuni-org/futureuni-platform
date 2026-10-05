/**
 * Phase 20 (SEC-5): the log redactor drops PII keys and masks emails / E.164 phones inside string
 * values, while leaving IDs and numeric values (money minor units) untouched.
 */

import { describe, expect, it } from "vitest";

import { redactLogData } from "./redact";

describe("redactLogData", () => {
  it("redacts PII keys whole", () => {
    expect(redactLogData({ email: "a@b.com", phone: "+2348012345678", body: "hi" })).toEqual({
      email: "[REDACTED]",
      phone: "[REDACTED]",
      body: "[REDACTED]",
    });
  });

  it("masks an email or E.164 phone that appears inside a string value", () => {
    expect(redactLogData({ note: "reach me at a@b.com or +2348012345678 today" })).toEqual({
      note: "reach me at [email] or [phone] today",
    });
  });

  it("leaves IDs and numeric money values alone (no phone false positives)", () => {
    expect(redactLogData({ leadId: "clabc000000000000000000001", totalMinor: 150_000_000 })).toEqual(
      { leadId: "clabc000000000000000000001", totalMinor: 150_000_000 },
    );
  });

  it("still drops secret keys (shared with the audit redactor)", () => {
    expect(redactLogData({ apiKey: "sk-123", nested: { token: "t" } })).toEqual({
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]" },
    });
  });

  it("walks arrays", () => {
    expect(redactLogData({ xs: ["x@y.com", "ok"] })).toEqual({ xs: ["[email]", "ok"] });
  });
});
