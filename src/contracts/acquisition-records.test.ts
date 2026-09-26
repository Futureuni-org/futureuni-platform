import { describe, expect, it } from "vitest";

import {
  HandoffContentSchema,
  PrecallBriefSchema,
  ProposalPackageSelectionSchema,
  ReplyActionsTakenSchema,
} from "./acquisition-records";
import { issuePaths } from "./test-helpers";

describe("acquisition-records contract", () => {
  it("parses the worked example (docs/contracts/acquisition-records.md §4)", () => {
    const brief = PrecallBriefSchema.parse({
      summary:
        "Lagos restaurant group with two branches; enquiries come through Instagram DMs and phone.",
      whatTheyCareAbout: ["More online orders", "Less time answering DMs"],
      likelyNeeds: ["A fast mobile site with a menu and ordering link"],
      suggestedQuestions: [
        "How do most customers order today?",
        "Who updates your menu?",
        "What does a busy Friday look like?",
        "Have you had a website before?",
        "What would success look like in three months?",
      ],
      suggestedPackage: {
        packageId: "starter_site",
        why: "No website today; menu and ordering are the core needs.",
      },
      priceRangeToDiscuss: { minMinor: 45_000_000, maxMinor: 90_000_000, currency: "NGN" },
      risks: ["Owner is the only decision maker and is busy at weekends"],
      citedFindingIds: ["cm1fnd00000000000000000001"],
    });
    expect(brief.suggestedQuestions).toHaveLength(5);
  });

  it("rejects the invalid example (§5): kebab-case package id and fractional money", () => {
    const result = ProposalPackageSelectionSchema.safeParse([
      {
        packageId: "starter-site",
        name: "Starter",
        quantity: 1,
        unitPriceMinor: 4500000.5,
        currency: "NGN",
        withinRange: true,
      },
    ]);
    expect(issuePaths(result).sort()).toEqual(["0.packageId", "0.unitPriceMinor"]);
  });

  it("caps the actions log at 50 entries", () => {
    const entry = { action: "SEQUENCE_STOPPED", at: "2026-10-03T09:00:00Z" };
    expect(ReplyActionsTakenSchema.safeParse(Array.from({ length: 51 }, () => entry)).success).toBe(
      false,
    );
  });

  it("a handoff snapshot needs at least one service", () => {
    const content = {
      company: {
        id: "cm1comp0000000000000000007",
        name: "Adunni Bakes & Events Ltd",
        website: null,
        country: "NG",
        city: "Lagos",
      },
      contacts: [],
      market: "NIGERIA",
      services: [],
      scope: [],
      timeline: { startDate: null, notes: "" },
      value: { amountMinor: 185_000_000, currency: "NGN" },
      paymentNotes: "",
      keyFindings: [],
      meetingSummaries: [],
      files: [],
      proposalId: null,
      snapshotAt: "2026-10-03T09:00:00Z",
    };
    expect(issuePaths(HandoffContentSchema.safeParse(content))).toEqual(["services"]);
  });
});
