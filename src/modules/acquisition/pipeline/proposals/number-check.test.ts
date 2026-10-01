import { describe, expect, it } from "vitest";

import { checkNumbersConsistent, formatDocDate } from "./number-check";

const allowed = {
  currency: "NGN" as const,
  allowedAmountsMinor: [150_000_000, 7_500_000, 142_500_000],
  allowedDates: ["25 Oct 2026"],
};

describe("checkNumbersConsistent", () => {
  it("passes when every amount and date matches a supplied figure", () => {
    const result = checkNumbersConsistent({
      ...allowed,
      text: "The business site is ₦1,500,000, less a ₦75,000 discount, for a total of ₦1,425,000. Prices valid until 25 Oct 2026.",
    });
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  // AC-34.4: prose states ₦1,450,000 when the total is ₦1,425,000.
  it("flags an amount that isn't a supplied figure (AC-34.4)", () => {
    const result = checkNumbersConsistent({
      ...allowed,
      text: "The total comes to ₦1,450,000.",
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({ kind: "amount", token: "₦1,450,000" });
  });

  it("flags a different currency symbol", () => {
    const result = checkNumbersConsistent({ ...allowed, text: "That's about $1,500,000." });
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]?.kind).toBe("currency");
  });

  it("flags compact money forms", () => {
    const result = checkNumbersConsistent({ ...allowed, text: "Roughly ₦1.4m all in." });
    expect(result.ok).toBe(false);
    expect(result.mismatches[0]?.kind).toBe("compact");
  });

  it("flags a calendar date that wasn't supplied", () => {
    const result = checkNumbersConsistent({
      ...allowed,
      text: "We can start on 1 Nov 2026 and finish by then. Prices valid until 25 Oct 2026.",
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({ kind: "date", token: "1 Nov 2026" });
  });

  it("ignores non-money numbers and week counts", () => {
    const result = checkNumbersConsistent({
      ...allowed,
      text: "Delivery takes 4 to 6 weeks across 3 milestones.",
    });
    expect(result.ok).toBe(true);
  });

  it("formats a document date as '25 Oct 2026'", () => {
    expect(formatDocDate(new Date("2026-10-25T00:00:00Z"))).toBe("25 Oct 2026");
    expect(formatDocDate(new Date("2026-10-05T00:00:00Z"))).toBe("5 Oct 2026");
  });
});
