import { describe, expect, it } from "vitest";

import { citedIdsInBody, draftLengthState, stripMarkers, tokenizeBody } from "./draft-text";

const FID = "abcdefghij0123456789"; // 20 chars, matches CITATION_MARKER

describe("draft-text citation parsing", () => {
  it("splits a body into text and citation tokens", () => {
    const tokens = tokenizeBody(`Your site is slow [[f:${FID}]] today.`);
    expect(tokens.filter((t) => t.type === "cite")).toHaveLength(1);
    const cite = tokens.find((t) => t.type === "cite");
    expect(cite).toMatchObject({ type: "cite", kind: "f", id: FID, index: 1 });
  });

  it("strips markers for a clean preview", () => {
    expect(stripMarkers(`Hello [[f:${FID}]] world`)).toBe("Hello world");
  });

  it("collects cited finding ids (not signal ids)", () => {
    const body = `A [[f:${FID}]] and B [[s:${FID}]]`;
    expect(citedIdsInBody(body)).toEqual([FID]);
  });
});

describe("draft-text length checks", () => {
  it("flags an over-long email subject on a first touch", () => {
    const state = draftLengthState("EMAIL", true, "x".repeat(61), "Short body.");
    expect(state.issues.some((i) => i.includes("/60"))).toBe(true);
  });

  it("flags a WhatsApp first line that doesn't name FUTUREUNI", () => {
    const state = draftLengthState("WHATSAPP_ASSISTED", true, null, "Hi there, quick note.");
    expect(state.issues.some((i) => i.includes("FUTUREUNI"))).toBe(true);
  });

  it("passes a compliant WhatsApp message", () => {
    const state = draftLengthState("WHATSAPP_ASSISTED", true, null, "FUTUREUNI here — quick note.");
    expect(state.issues).toHaveLength(0);
  });
});
