/**
 * The scoring engine (docs/specs/module-acquisition.md §3.8, docs/prompts/wave-3/phase-11-scoring.md
 * Step 1). `scoreLead` is pure and deterministic: no I/O, fully testable, the same input always gives
 * the same output. Conditions are evaluated against the flattened `ScoringFacts` (built elsewhere by
 * `buildScoringFacts`, which does the reads). The condition grammar is the structured AST defined in
 * the service-line-profile contract — there is no free-text parser.
 */

import {
  SEVERITY_ORDER,
  type FindingSeverity,
  type ScoreBand,
} from "@/contracts/common";
import type {
  Condition,
  ConditionAtom,
  ConditionField,
  ScoreReason,
  ScoringFacts,
  ServiceLineProfile,
} from "@/contracts/service-line-profile";

/** The profile's scoring block (rules, thresholds, band, low-score behaviour). */
export type ScoringConfig = ServiceLineProfile["scoring"];

export interface ScoreLeadInput {
  facts: ScoringFacts;
  scoring: ScoringConfig;
}

export interface ScoreResult {
  /** Clamped to 0..100. */
  score: number;
  /** Matching rules only, sorted by |points| descending (ruleId breaks ties, for stable snapshots). */
  reasons: ScoreReason[];
  band: ScoreBand;
}

/** CompanySizeRange in order; UNKNOWN is intentionally absent, so it never matches gt/gte/lt/lte. */
const SIZE_RANGE_ORDER = [
  "SOLO",
  "SIZE_2_10",
  "SIZE_11_50",
  "SIZE_51_200",
  "SIZE_201_1000",
  "SIZE_1000_PLUS",
] as const;

type FieldValue = string | number | boolean | null;

/** Resolves the fact a `field` atom compares against. Unknown facts are `null` (they never match). */
function fieldValue(field: ConditionField, facts: ScoringFacts): FieldValue {
  switch (field) {
    case "market":
      return facts.market;
    case "country":
      return facts.country;
    case "company.legalForm":
      return facts.company.legalForm;
    case "company.sizeRange":
      return facts.company.sizeRange;
    case "company.websiteKind":
      return facts.company.websiteKind;
    case "company.hasWebsite":
      return facts.company.hasWebsite;
    case "company.industry":
      return facts.company.industry;
    case "company.isActiveClient":
      return facts.company.isActiveClient;
    case "company.copyrightYear":
      return facts.company.copyrightYear;
    case "contact.primary.exists":
      return facts.contact.primary.exists;
    case "contact.primary.emailStatus":
      return facts.contact.primary.emailStatus;
    case "contact.primary.emailType":
      return facts.contact.primary.emailType;
    case "contact.primary.whatsappStatus":
      return facts.contact.primary.whatsappStatus;
    case "contact.primary.seniority":
      return facts.contact.primary.seniority;
    case "contactability.email":
      return facts.contactability.email;
    case "contactability.hasAssistedChannel":
      return facts.contactability.hasAssistedChannel;
    case "signal.count":
      return facts.signals.length;
    case "finding.pitchableCount":
      return facts.findings.filter((f) => f.pitchable).length;
  }
}

function severityRank(severity: FindingSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/** `>=` on finding severity, using the fixed INFO < LOW < MEDIUM < HIGH < CRITICAL order. */
function severityAtLeast(actual: FindingSeverity, min: FindingSeverity): boolean {
  return severityRank(actual) >= severityRank(min);
}

/** Ordered comparison for sizeRange (by position) and numbers. Returns null when not comparable. */
function compareOrdered(field: ConditionField, actual: FieldValue, bound: FieldValue): number | null {
  if (field === "company.sizeRange") {
    const a = SIZE_RANGE_ORDER.indexOf(actual as (typeof SIZE_RANGE_ORDER)[number]);
    const b = SIZE_RANGE_ORDER.indexOf(bound as (typeof SIZE_RANGE_ORDER)[number]);
    if (a < 0 || b < 0) return null; // UNKNOWN (or a bad bound) never matches >,<
    return a - b;
  }
  if (typeof actual === "number" && typeof bound === "number") return actual - bound;
  return null;
}

function evalFieldAtom(
  atom: Extract<ConditionAtom, { kind: "field" }>,
  facts: ScoringFacts,
): boolean {
  const actual = fieldValue(atom.field, facts);
  const { op, value } = atom;

  // A null fact never matches, except under neq and notIn (service-line-profile.md §3.6).
  if (actual === null) return op === "neq" || op === "notIn";

  switch (op) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "in":
      return Array.isArray(value) && value.includes(actual);
    case "notIn":
      return Array.isArray(value) && !value.includes(actual);
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (Array.isArray(value)) return false;
      const cmp = compareOrdered(atom.field, actual, value);
      if (cmp === null) return false;
      if (op === "gt") return cmp > 0;
      if (op === "gte") return cmp >= 0;
      if (op === "lt") return cmp < 0;
      return cmp <= 0; // lte
    }
  }
}

/** Evaluates one condition atom against the facts. */
export function evalAtom(atom: ConditionAtom, facts: ScoringFacts): boolean {
  switch (atom.kind) {
    case "signal": {
      // Matches on signalType, including derived signals written by Phases 9 and 10.
      const present = facts.signals.some((s) => s.signalType === atom.signalId);
      return atom.negate ? !present : present;
    }
    case "finding": {
      // Only non-dismissed findings reach the facts; honour pitchableOnly and minSeverity.
      const present = facts.findings.some(
        (f) =>
          f.checkId === atom.checkId &&
          (!atom.pitchableOnly || f.pitchable) &&
          (atom.minSeverity === undefined || severityAtLeast(f.severity, atom.minSeverity)),
      );
      return atom.negate ? !present : present;
    }
    case "field":
      return evalFieldAtom(atom, facts);
  }
}

/** A condition holds when all of its atoms hold (AND). */
export function evalCondition(condition: Condition, facts: ScoringFacts): boolean {
  return condition.all.every((atom) => evalAtom(atom, facts));
}

/** The band a clamped score falls in. qualifyThreshold === borderlineBand.max + 1, so this partitions. */
export function bandFor(score: number, scoring: ScoringConfig): ScoreBand {
  if (score >= scoring.qualifyThreshold) return "QUALIFIED";
  if (score >= scoring.borderlineBand.min) return "BORDERLINE";
  return "BELOW";
}

/**
 * Scores a lead: the sum of matching rule points, clamped to 0..100, with an itemised, stably
 * ordered explanation and the band. Pure and deterministic.
 */
export function scoreLead(input: ScoreLeadInput): ScoreResult {
  const reasons: ScoreReason[] = [];
  let raw = 0;
  for (const rule of input.scoring.rules) {
    if (evalCondition(rule.condition, input.facts)) {
      raw += rule.points;
      reasons.push({ ruleId: rule.id, label: rule.label, points: rule.points });
    }
  }
  const score = Math.max(0, Math.min(100, raw));
  reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.ruleId.localeCompare(b.ruleId));
  return { score, reasons, band: bandFor(score, input.scoring) };
}
