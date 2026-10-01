import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { server } from "@/tests/setup/msw-server";

import { renderProposalPdf, type ProposalPdfData } from "./render";

// Renders the sample Nigerian and UK proposals used for the Phase 14 visual check (M14-AC6),
// writing them to phases/14/samples/. react-pdf fetches an internal wasm via a data: URL, so MSW
// is closed for this suite (it makes no HTTP calls).
beforeAll(() => {
  server.close();
});
afterAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

const nigeria: ProposalPdfData = {
  ref: "PRP-NG0001",
  version: 1,
  companyName: "Lagos Interiors",
  preparedOn: "1 Oct 2026",
  validUntil: "25 Oct 2026",
  currency: "NGN",
  sections: {
    understanding:
      "Your current website takes over eight seconds to load on mobile and hides your contact details, so enquiries are slipping away before they reach you.",
    solution: "A fast, modern business website with a clear, prominent enquiry path, built mobile-first.",
    scope: "Design, build and launch of up to six pages, with your content and a simple enquiry form.",
    timeline: "The work runs over four to six weeks from kick-off, in stages you review as we go.",
    investmentIntro: "The investment below covers design, build and launch, with no hidden extras.",
    whyFutureuni: "We build fast, accessible websites for growing Nigerian businesses and stay close through launch.",
    terms: "A deposit begins the work and the balance is due on launch. The quote is fixed for the validity period.",
    nextSteps: "Reply to accept and we will send the kick-off details and the first set of questions.",
  },
  lines: [
    { description: "Business site", quantity: 1, unitPriceMinor: 180_000_000, totalMinor: 180_000_000 },
    { description: "Care plan (3 months)", quantity: 3, unitPriceMinor: 10_000_000, totalMinor: 30_000_000 },
  ],
  subtotalMinor: 210_000_000,
  discountMinor: 10_500_000,
  taxRateBps: 0,
  taxMinor: 0,
  totalMinor: 199_500_000,
  portfolio: [{ title: "Kano Textiles online store", outcomeMetric: "35% more enquiries in three months" }],
};

const uk: ProposalPdfData = {
  ref: "PRP-UK0001",
  version: 2,
  companyName: "Bristol Fintech",
  preparedOn: "1 Oct 2026",
  validUntil: "25 Oct 2026",
  currency: "GBP",
  sections: {
    understanding:
      "Your onboarding flow loses users at the identity step, and your sign-up conversion has fallen over the last two quarters.",
    solution: "A redesigned onboarding flow that removes friction at the identity step and guides users to activation.",
    scope: "Discovery, flow redesign, a clickable prototype and a build-ready specification.",
    timeline: "A focused engagement over five to seven weeks, with a prototype in week three.",
    investmentIntro: "The investment below covers the full redesign engagement.",
    whyFutureuni: "We design calm, accessible product flows and measure the outcome, not just the pixels.",
    terms: "Half to begin and half on delivery of the specification. The quote is fixed for the validity period.",
    nextSteps: "Reply to accept and we will schedule the discovery session.",
  },
  lines: [{ description: "Flow redesign", quantity: 1, unitPriceMinor: 450_000, totalMinor: 450_000 }],
  subtotalMinor: 450_000,
  discountMinor: 0,
  taxRateBps: 2_000,
  taxMinor: 90_000,
  totalMinor: 540_000,
  portfolio: [{ title: "Leeds SaaS onboarding redesign", outcomeMetric: "22% higher activation" }],
};

describe("sample proposal PDFs", () => {
  it("renders the Nigerian and UK samples to phases/14/samples", async () => {
    const dir = path.join(process.cwd(), "phases", "14", "samples");
    mkdirSync(dir, { recursive: true });
    for (const [name, data] of [
      ["proposal-nigeria.pdf", nigeria],
      ["proposal-uk.pdf", uk],
    ] as const) {
      const buffer = await renderProposalPdf(data);
      expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
      writeFileSync(path.join(dir, name), buffer);
    }
  }, 30_000);
});
