import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH, checkPassword } from "./password";

describe("checkPassword", () => {
  it("exposes the minimum length", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
  });

  it("rejects passwords shorter than the minimum length", () => {
    const check = checkPassword("short");
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("TOO_SHORT");
  });

  it("rejects common passwords even when long enough", () => {
    const check = checkPassword("password12345");
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("COMMON");
  });

  it("accepts a moderately mixed 12+ character password", () => {
    const check = checkPassword("Neh8usiga!zuu");
    expect(check.ok).toBe(true);
    expect(check.score).toBeGreaterThanOrEqual(2);
  });

  it("scores longer, more varied passwords higher", () => {
    const strong = checkPassword("Naked-Zebra-42/Bricks-9");
    expect(strong.ok).toBe(true);
    expect(strong.score).toBeGreaterThanOrEqual(3);
  });
});
