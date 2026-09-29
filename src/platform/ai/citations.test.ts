import { describe, expect, it } from "vitest";

import { assertClaimsCited, stripCitationMarkers } from "./citations";

const FINDING_ID = "abcdefghijklmnopqrstuvwx"; // 24 lower-case alphanumerics
const SIGNAL_ID = "signal1234567890abcdefghij";

describe("assertClaimsCited", () => {
  it("passes when every marker id is in the allowed set", () => {
    expect(() => {
      assertClaimsCited(`We noticed [[f:${FINDING_ID}]] on the site.`, [FINDING_ID]);
    }).not.toThrow();
  });

  it("rejects an unknown id with details.unknownIds", () => {
    try {
      assertClaimsCited(`Hallucinated: [[f:${FINDING_ID}]]`, [SIGNAL_ID]);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CITATION_INVALID");
      expect((err as { details?: { unknownIds?: string[] } }).details?.unknownIds).toContain(
        FINDING_ID,
      );
    }
  });

  it("requireAtLeastOne fires when there are no markers", () => {
    try {
      assertClaimsCited("Plain text, no citations.", [FINDING_ID], { requireAtLeastOne: true });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CITATION_INVALID");
    }
  });

  it("accepts array input", () => {
    expect(() => {
      assertClaimsCited(
        [`One [[s:${SIGNAL_ID}]]`, `Two [[f:${FINDING_ID}]]`],
        [SIGNAL_ID, FINDING_ID],
      );
    }).not.toThrow();
  });
});

describe("stripCitationMarkers", () => {
  it("removes markers and collapses run-on whitespace", () => {
    const raw = `We saw [[f:${FINDING_ID}]] on the homepage.`;
    expect(stripCitationMarkers(raw)).toBe("We saw  on the homepage.".replace(/  +/g, " "));
  });

  it("is idempotent on already-stripped text", () => {
    const stripped = stripCitationMarkers(`A [[s:${SIGNAL_ID}]] B`);
    expect(stripCitationMarkers(stripped)).toBe(stripped);
  });
});
