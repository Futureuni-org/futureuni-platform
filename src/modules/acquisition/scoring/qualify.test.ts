import { describe, expect, it } from "vitest";

import type { EmailVerdict } from "@/contracts/enrichment";
import type { ScoringFacts, ServiceLineProfile } from "@/contracts/service-line-profile";
import type { ScoreBand } from "@/contracts/common";

import { decideOutcome } from "./outcome";
import type { ScoreResult } from "./engine";

function facts(over: {
  email?: EmailVerdict;
  hasAssistedChannel?: boolean;
  company?: Partial<ScoringFacts["company"]>;
}): ScoringFacts {
  return {
    market: "INTERNATIONAL",
    country: "GB",
    company: {
      legalForm: "LIMITED",
      sizeRange: "SIZE_2_10",
      websiteKind: "OWN_SITE",
      hasWebsite: true,
      industry: "retail",
      isActiveClient: false,
      copyrightYear: 2020,
      ...over.company,
    },
    contact: {
      primary: { exists: true, emailStatus: "VALID", emailType: "PERSONAL", whatsappStatus: "NONE", seniority: "OWNER" },
    },
    contactability: { email: over.email ?? "ALLOWED", hasAssistedChannel: over.hasAssistedChannel ?? false },
    signals: [],
    findings: [],
  };
}

function score(band: ScoreBand, value = band === "QUALIFIED" ? 80 : band === "BORDERLINE" ? 50 : 20): ScoreResult {
  return { score: value, band, reasons: [] };
}

const noDisqualifiers: ServiceLineProfile["disqualifiers"] = [];

describe("decideOutcome — channel check (AC-14.4, AC-14.6)", () => {
  it("email BLOCKED and no assisted channel → DISQUALIFIED(no_channel)", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({ email: "BLOCKED", hasAssistedChannel: false }),
      disqualifiers: noDisqualifiers,
      lowScoreAction: "DISQUALIFY",
      throttleMode: "NORMAL",
    });
    expect(out).toEqual({ status: "DISQUALIFIED", reason: "no_channel" });
  });

  it("email BLOCKED but an assisted channel exists → continues to SCORED", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({ email: "BLOCKED", hasAssistedChannel: true }),
      disqualifiers: noDisqualifiers,
      lowScoreAction: "DISQUALIFY",
      throttleMode: "NORMAL",
    });
    expect(out.status).toBe("SCORED");
  });

  it("email REVIEW/CONSENT_REQUIRED and no assisted channel → NURTURE(COMPLIANCE), never disqualified", () => {
    for (const email of ["REVIEW", "CONSENT_REQUIRED"] as const) {
      const out = decideOutcome(score("QUALIFIED"), {
        facts: facts({ email, hasAssistedChannel: false }),
        disqualifiers: noDisqualifiers,
        lowScoreAction: "DISQUALIFY",
        throttleMode: "NORMAL",
      });
      expect(out).toEqual({ status: "NURTURE", nurtureReason: "COMPLIANCE", reason: "COMPLIANCE" });
    }
  });

  it("email REVIEW with an assisted channel → continues (Phase 9 owns the complianceReview flag)", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({ email: "REVIEW", hasAssistedChannel: true }),
      disqualifiers: noDisqualifiers,
      lowScoreAction: "DISQUALIFY",
      throttleMode: "NORMAL",
    });
    expect(out.status).toBe("SCORED");
  });
});

describe("decideOutcome — disqualifiers", () => {
  it("a matching disqualifier with a condition → DISQUALIFIED(disqualifier:<id>)", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({ company: { isActiveClient: true } }),
      disqualifiers: [
        {
          id: "active_client",
          label: "Already a client",
          description: "Active FUTUREUNI client.",
          condition: { all: [{ kind: "field", field: "company.isActiveClient", op: "eq", value: true }] },
        },
      ],
      lowScoreAction: "DISQUALIFY",
      throttleMode: "NORMAL",
    });
    expect(out).toEqual({ status: "DISQUALIFIED", reason: "disqualifier:active_client" });
  });

  it("a condition-less disqualifier is left to the AI/human review (not auto-applied)", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({}),
      disqualifiers: [{ id: "competitor_agency", label: "Competitor", description: "An agency." }],
      lowScoreAction: "DISQUALIFY",
      throttleMode: "NORMAL",
    });
    expect(out.status).toBe("SCORED");
  });
});

describe("decideOutcome — bands and capacity", () => {
  it("BELOW → DISQUALIFIED(low_score) or NURTURE(LOW_SCORE) per lowScoreAction", () => {
    const base = { facts: facts({}), disqualifiers: noDisqualifiers, throttleMode: "NORMAL" as const };
    expect(decideOutcome(score("BELOW"), { ...base, lowScoreAction: "DISQUALIFY" })).toEqual({
      status: "DISQUALIFIED",
      reason: "low_score",
    });
    expect(decideOutcome(score("BELOW"), { ...base, lowScoreAction: "NURTURE" })).toEqual({
      status: "NURTURE",
      nurtureReason: "LOW_SCORE",
      reason: "LOW_SCORE",
    });
  });

  it("QUALIFIED and BORDERLINE both target SCORED (borderline is never auto-disqualified)", () => {
    const base = { facts: facts({}), disqualifiers: noDisqualifiers, lowScoreAction: "DISQUALIFY" as const, throttleMode: "NORMAL" as const };
    expect(decideOutcome(score("QUALIFIED"), base).status).toBe("SCORED");
    expect(decideOutcome(score("BORDERLINE"), base).status).toBe("SCORED");
  });

  it("PAUSED sends qualified leads to NURTURE(CAPACITY) (AC-18.2)", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({}),
      disqualifiers: noDisqualifiers,
      lowScoreAction: "DISQUALIFY",
      throttleMode: "PAUSED",
    });
    expect(out).toEqual({ status: "NURTURE", nurtureReason: "CAPACITY", reason: "CAPACITY" });
  });

  it("SLOW does not hold qualified leads", () => {
    const out = decideOutcome(score("QUALIFIED"), {
      facts: facts({}),
      disqualifiers: noDisqualifiers,
      lowScoreAction: "DISQUALIFY",
      throttleMode: "SLOW",
    });
    expect(out.status).toBe("SCORED");
  });
});
