import { describe, expect, it } from "vitest";

import { extractLegalFormHints } from "./legal-form-hints";

describe("legal-form hint extractor", () => {
  it("finds UK Ltd suffix and company number", () => {
    const html = `<footer>© 2024 Ada Labs Ltd · Company No. 12345678</footer>`;
    const hints = extractLegalFormHints({ html, pageUrl: "https://ada.example/" });
    expect(hints.some((h) => h.kind === "suffix" && h.value.includes('Ltd'))).toBe(true);
    expect(hints.some((h) => h.kind === "uk-company-number" && h.value === "12345678")).toBe(true);
  });

  it("finds Nigerian RC and BN numbers", () => {
    const hints = extractLegalFormHints({ html: `RC 123456 · BN-987654` });
    expect(hints.some((h) => h.kind === "ng-rc" && h.value === "RC123456")).toBe(true);
    expect(hints.some((h) => h.kind === "ng-bn" && h.value === "BN987654")).toBe(true);
  });

  it("picks up sole-trader wording", () => {
    const hints = extractLegalFormHints({ html: "<p>Ada is a sole trader based in Manchester.</p>" });
    expect(hints[0]?.kind).toBe("sole-trader-wording");
  });
});
