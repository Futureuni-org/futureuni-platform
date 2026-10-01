import { describe, expect, it } from "vitest";

import type { ServiceLine } from "@/contracts/common";
import type { Condition, ScoringFacts, ServiceLineProfile } from "@/contracts/service-line-profile";
import { DEFAULT_PROFILES } from "@/modules/acquisition/profiles/defaults";

import { bandFor, evalAtom, evalCondition, scoreLead, type ScoringConfig } from "./engine";

/** A neutral facts object; individual tests override the parts they exercise. */
function facts(over: Partial<ScoringFacts> = {}): ScoringFacts {
  return {
    market: "NIGERIA",
    country: "NG",
    company: {
      legalForm: "LIMITED",
      sizeRange: "SIZE_2_10",
      websiteKind: "NONE",
      hasWebsite: false,
      industry: "retail",
      isActiveClient: false,
      copyrightYear: null,
    },
    contact: {
      primary: {
        exists: true,
        emailStatus: "VALID",
        emailType: "PERSONAL",
        whatsappStatus: "LIKELY",
        seniority: "OWNER",
      },
    },
    contactability: { email: "ALLOWED", hasAssistedChannel: true },
    signals: [],
    findings: [],
    ...over,
  };
}

describe("evalAtom — signal", () => {
  it("matches on signalType and honours negate", () => {
    const f = facts({ signals: [{ id: "s1", signalType: "no_website" }] });
    expect(evalAtom({ kind: "signal", signalId: "no_website", negate: false }, f)).toBe(true);
    expect(evalAtom({ kind: "signal", signalId: "gone_quiet", negate: false }, f)).toBe(false);
    expect(evalAtom({ kind: "signal", signalId: "gone_quiet", negate: true }, f)).toBe(true);
  });
});

describe("evalAtom — finding", () => {
  const f = facts({
    findings: [
      { id: "f1", checkId: "web.pagespeed_mobile", severity: "HIGH", pitchable: true, dismissed: false },
      { id: "f2", checkId: "web.ssl", severity: "LOW", pitchable: false, dismissed: false },
    ],
  });

  it("matches any non-dismissed finding for a check", () => {
    expect(evalAtom({ kind: "finding", checkId: "web.ssl", pitchableOnly: false, negate: false }, f)).toBe(true);
  });
  it("honours minSeverity with the fixed order", () => {
    expect(
      evalAtom({ kind: "finding", checkId: "web.pagespeed_mobile", minSeverity: "HIGH", pitchableOnly: false, negate: false }, f),
    ).toBe(true);
    expect(
      evalAtom({ kind: "finding", checkId: "web.ssl", minSeverity: "MEDIUM", pitchableOnly: false, negate: false }, f),
    ).toBe(false);
  });
  it("honours pitchableOnly", () => {
    expect(evalAtom({ kind: "finding", checkId: "web.ssl", pitchableOnly: true, negate: false }, f)).toBe(false);
    expect(evalAtom({ kind: "finding", checkId: "web.pagespeed_mobile", pitchableOnly: true, negate: false }, f)).toBe(true);
  });
  it("honours negate", () => {
    expect(evalAtom({ kind: "finding", checkId: "web.seo_basics", pitchableOnly: false, negate: true }, f)).toBe(true);
  });
});

describe("evalAtom — field", () => {
  it("eq / neq / in / notIn", () => {
    const f = facts();
    expect(evalAtom({ kind: "field", field: "market", op: "eq", value: "NIGERIA" }, f)).toBe(true);
    expect(evalAtom({ kind: "field", field: "market", op: "neq", value: "NIGERIA" }, f)).toBe(false);
    expect(evalAtom({ kind: "field", field: "company.legalForm", op: "in", value: ["LIMITED", "LLP"] }, f)).toBe(true);
    expect(evalAtom({ kind: "field", field: "company.legalForm", op: "notIn", value: ["LLP"] }, f)).toBe(true);
  });

  it("boolean fields", () => {
    const f = facts();
    expect(evalAtom({ kind: "field", field: "company.hasWebsite", op: "eq", value: false }, f)).toBe(true);
    expect(evalAtom({ kind: "field", field: "contactability.hasAssistedChannel", op: "eq", value: true }, f)).toBe(true);
  });

  it("numeric fields (signal.count, finding.pitchableCount)", () => {
    const f = facts({
      signals: [
        { id: "s1", signalType: "a" },
        { id: "s2", signalType: "b" },
      ],
      findings: [
        { id: "f1", checkId: "c", severity: "HIGH", pitchable: true, dismissed: false },
        { id: "f2", checkId: "d", severity: "LOW", pitchable: false, dismissed: false },
      ],
    });
    expect(evalAtom({ kind: "field", field: "signal.count", op: "gte", value: 2 }, f)).toBe(true);
    expect(evalAtom({ kind: "field", field: "signal.count", op: "gt", value: 2 }, f)).toBe(false);
    expect(evalAtom({ kind: "field", field: "finding.pitchableCount", op: "eq", value: 1 }, f)).toBe(true);
  });

  it("ordered sizeRange; UNKNOWN never matches gt/lt", () => {
    const small = facts();
    expect(evalAtom({ kind: "field", field: "company.sizeRange", op: "gte", value: "SIZE_2_10" }, small)).toBe(true);
    expect(evalAtom({ kind: "field", field: "company.sizeRange", op: "gt", value: "SIZE_11_50" }, small)).toBe(false);
    const unknown = facts({ company: { ...facts().company, sizeRange: "UNKNOWN" } });
    expect(evalAtom({ kind: "field", field: "company.sizeRange", op: "gt", value: "SOLO" }, unknown)).toBe(false);
    expect(evalAtom({ kind: "field", field: "company.sizeRange", op: "lt", value: "SIZE_1000_PLUS" }, unknown)).toBe(false);
  });

  it("a null fact never matches, except neq and notIn", () => {
    const f = facts({
      company: { ...facts().company, copyrightYear: null, industry: null },
      contact: { primary: { exists: false, emailStatus: null, emailType: null, whatsappStatus: null, seniority: null } },
    });
    expect(evalAtom({ kind: "field", field: "company.copyrightYear", op: "gte", value: 2020 }, f)).toBe(false);
    expect(evalAtom({ kind: "field", field: "company.copyrightYear", op: "eq", value: 2020 }, f)).toBe(false);
    expect(evalAtom({ kind: "field", field: "contact.primary.emailStatus", op: "eq", value: "VALID" }, f)).toBe(false);
    expect(evalAtom({ kind: "field", field: "contact.primary.emailStatus", op: "neq", value: "VALID" }, f)).toBe(true);
    expect(evalAtom({ kind: "field", field: "contact.primary.emailType", op: "notIn", value: ["ROLE"] }, f)).toBe(true);
  });
});

describe("evalCondition — all atoms must hold (AND)", () => {
  it("is true only when every atom holds", () => {
    const f = facts({ signals: [{ id: "s1", signalType: "no_website" }] });
    const cond: Condition = {
      all: [
        { kind: "signal", signalId: "no_website", negate: false },
        { kind: "field", field: "contact.primary.emailStatus", op: "eq", value: "VALID" },
      ],
    };
    expect(evalCondition(cond, f)).toBe(true);
    expect(evalCondition({ all: [...cond.all, { kind: "field", field: "market", op: "eq", value: "INTERNATIONAL" }] }, f)).toBe(false);
  });
});

describe("scoreLead — clamping, bands, ordering", () => {
  const scoring: ScoringConfig = {
    rules: [
      { id: "big_plus", label: "Big plus", condition: { all: [{ kind: "signal", signalId: "a", negate: false }] }, points: 50 },
      { id: "another_plus", label: "Another plus", condition: { all: [{ kind: "signal", signalId: "b", negate: false }] }, points: 40 },
      { id: "third_plus", label: "Third plus", condition: { all: [{ kind: "signal", signalId: "c", negate: false }] }, points: 30 },
      { id: "small_minus", label: "Small minus", condition: { all: [{ kind: "signal", signalId: "d", negate: false }] }, points: -10 },
    ],
    qualifyThreshold: 61,
    borderlineBand: { min: 40, max: 60 },
    lowScoreAction: "DISQUALIFY",
  };

  it("clamps the sum to 0..100", () => {
    const high = scoreLead({
      scoring,
      facts: facts({ signals: ["a", "b", "c"].map((t, i) => ({ id: `s${String(i)}`, signalType: t })) }),
    });
    expect(high.score).toBe(100); // 50+40+30 = 120 → clamped
    const onlyMinus = scoreLead({ scoring, facts: facts({ signals: [{ id: "s1", signalType: "d" }] }) });
    expect(onlyMinus.score).toBe(0); // -10 → clamped
  });

  it("orders reasons by |points| desc, ruleId breaking ties", () => {
    const r = scoreLead({
      scoring,
      facts: facts({ signals: ["a", "d", "c"].map((t, i) => ({ id: `s${String(i)}`, signalType: t })) }),
    });
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["big_plus", "third_plus", "small_minus"]);
  });

  it("bands at the boundaries 39/40/60/61", () => {
    expect(bandFor(39, scoring)).toBe("BELOW");
    expect(bandFor(40, scoring)).toBe("BORDERLINE");
    expect(bandFor(60, scoring)).toBe("BORDERLINE");
    expect(bandFor(61, scoring)).toBe("QUALIFIED");
  });

  it("is deterministic (same input → same output)", () => {
    const input = { scoring, facts: facts({ signals: [{ id: "s1", signalType: "a" }] }) };
    expect(scoreLead(input)).toEqual(scoreLead(input));
  });
});

/**
 * Golden snapshots per line (M11-AC1). For each default profile, build facts that satisfy its own
 * signals and a critical pitchable finding for every audited check, plus a weak lead with none, and
 * snapshot the scored result. A change to the engine or any default profile updates these on review.
 */
describe("scoreLead — golden snapshots per line", () => {
  const strongFactsFor = (profile: ServiceLineProfile): ScoringFacts =>
    facts({
      company: { legalForm: "LIMITED", sizeRange: "SIZE_2_10", websiteKind: "NONE", hasWebsite: false, industry: "retail", isActiveClient: false, copyrightYear: 2016 },
      contact: { primary: { exists: true, emailStatus: "VALID", emailType: "PERSONAL", whatsappStatus: "CONFIRMED", seniority: "OWNER" } },
      contactability: { email: "ALLOWED", hasAssistedChannel: true },
      signals: profile.signals.map((s, i) => ({ id: `sig${String(i)}`, signalType: s.id })),
      findings: profile.audits.flatMap((a, ai) =>
        a.checks.map((c, ci) => ({ id: `fin${String(ai)}_${String(ci)}`, checkId: c.checkId, severity: "CRITICAL" as const, pitchable: true, dismissed: false as const })),
      ),
    });

  const lines = Object.keys(DEFAULT_PROFILES) as ServiceLine[];

  for (const line of lines) {
    const profile = DEFAULT_PROFILES[line];

    it(`${line}: a strong lead`, () => {
      expect(scoreLead({ scoring: profile.scoring, facts: strongFactsFor(profile) })).toMatchSnapshot();
    });

    it(`${line}: a weak lead (no signals or findings)`, () => {
      expect(scoreLead({ scoring: profile.scoring, facts: facts({ signals: [], findings: [] }) })).toMatchSnapshot();
    });
  }
});
