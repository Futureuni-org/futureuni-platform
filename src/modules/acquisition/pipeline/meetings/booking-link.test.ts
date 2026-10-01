import { describe, expect, it } from "vitest";

import { buildBookingUrl, signLeadRef, verifyLeadRef } from "./booking-link";

const LEAD_ID = "cm1lead0000000000000000042";

describe("booking-link", () => {
  it("round-trips a signed lead reference (M14-AC5)", () => {
    const token = signLeadRef(LEAD_ID);
    expect(token.startsWith(`${LEAD_ID}.`)).toBe(true);
    expect(verifyLeadRef(token)).toBe(LEAD_ID);
  });

  it("rejects a tampered reference", () => {
    const token = signLeadRef(LEAD_ID);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyLeadRef(tampered)).toBeNull();
  });

  it("rejects a reference with a swapped lead id", () => {
    const token = signLeadRef(LEAD_ID);
    const signature = token.slice(token.lastIndexOf(".") + 1);
    expect(verifyLeadRef(`cm1lead0000000000000000099.${signature}`)).toBeNull();
  });

  it("rejects junk, empty and unsigned values", () => {
    expect(verifyLeadRef(null)).toBeNull();
    expect(verifyLeadRef("")).toBeNull();
    expect(verifyLeadRef("no-separator")).toBeNull();
    expect(verifyLeadRef(`${LEAD_ID}.`)).toBeNull();
  });

  it("embeds the reference as the leadRef prefill parameter", () => {
    const token = signLeadRef(LEAD_ID);
    const url = buildBookingUrl("https://cal.com/futureuni/intro", token);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("leadRef")).toBe(token);
    expect(verifyLeadRef(parsed.searchParams.get("leadRef"))).toBe(LEAD_ID);
  });

  it("preserves an existing query string on the booking URL", () => {
    const url = buildBookingUrl("https://cal.com/u/intro?month=2026-10", signLeadRef(LEAD_ID));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("month")).toBe("2026-10");
    expect(parsed.searchParams.get("leadRef")).not.toBeNull();
  });
});
