import { describe, expect, it } from "vitest";

import { safeNext } from "./redirect";

describe("safeNext", () => {
  it.each([
    [null, "/"],
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["/dashboard", "/dashboard"],
    ["/acquisition/leads?tab=review", "/acquisition/leads?tab=review"],
  ])("returns %s -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    "https://evil.com/",
    "//evil.com/",
    "/\\evil.com",
    "\\evil.com",
    "http://localhost",
    "javascript:alert(1)",
    "  ",
    "/\u0000/x",
  ])("refuses unsafe target %s", (bad) => {
    expect(safeNext(bad)).toBe("/");
  });

  it.each(["/login", "/login/2fa", "/invite/abc", "/reset", "/reset/xyz", "/setup-2fa", "/signed-out"])(
    "refuses auth path %s",
    (bad) => {
      expect(safeNext(bad)).toBe("/");
    },
  );
});
