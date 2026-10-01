import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { server } from "@/tests/setup/msw-server";

import { renderProposalPdf, type ProposalPdfData } from "./render";

// @react-pdf/renderer loads an internal wasm module by fetching a data: URL, which the shared MSW
// server (onUnhandledRequest: error) rejects. This suite makes no HTTP calls, so close MSW for it
// and let Node resolve the data: URL natively.
beforeAll(() => {
  server.close();
});
afterAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

const sample: ProposalPdfData = {
  ref: "PRP-TEST-0001",
  version: 1,
  companyName: "Acme Interiors",
  preparedOn: "25 Sep 2026",
  validUntil: "25 Oct 2026",
  currency: "NGN",
  sections: {
    understanding: "Your current site loads slowly on mobile and has no clear enquiry path.",
    solution: "A fast, modern business site with a prominent contact flow.",
    scope: "Design, build and launch of a five-page site.",
    timeline: "Four to six weeks from kick-off.",
    investmentIntro: "The investment below covers design, build and launch.",
    whyFutureuni: "We build fast, accessible sites for Nigerian businesses.",
    terms: "Fifty percent to begin, fifty on launch.",
    nextSteps: "Reply to accept and we will send the kick-off details.",
  },
  lines: [
    { description: "Business site", quantity: 1, unitPriceMinor: 150_000_000, totalMinor: 150_000_000 },
    { description: "Care plan (3 months)", quantity: 3, unitPriceMinor: 10_000_000, totalMinor: 30_000_000 },
  ],
  subtotalMinor: 180_000_000,
  discountMinor: 9_000_000,
  taxRateBps: 0,
  taxMinor: 0,
  totalMinor: 171_000_000,
  portfolio: [{ title: "Kano Textiles store", outcomeMetric: "35% more enquiries" }],
};

describe("renderProposalPdf", () => {
  it("renders a PDF buffer with the brand fonts", async () => {
    const buffer = await renderProposalPdf(sample);
    expect(buffer.byteLength).toBeGreaterThan(1_000);
    // PDF files start with the "%PDF" magic bytes.
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  }, 30_000);
});
