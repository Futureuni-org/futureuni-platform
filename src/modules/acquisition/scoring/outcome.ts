/**
 * The qualification decision (phase-11 Step 2), kept pure and dependency-light so it is unit-testable
 * without loading the server graph. `qualifyLead` wraps it with the reads, transition and events.
 */

import type { LeadStatus, NurtureReason } from "@/contracts/common";
import type { ScoringFacts, ServiceLineProfile } from "@/contracts/service-line-profile";

import { evalCondition, type ScoreResult } from "./engine";

export interface Outcome {
  status: LeadStatus;
  reason?: string;
  nurtureReason?: NurtureReason;
}

/**
 * Decides the target status from the score, the channel verdict, the profile's disqualifiers and the
 * throttle. A borderline lead is never auto-disqualified (it targets SCORED for human review, unless
 * capacity holds it). Pure — no I/O.
 */
export function decideOutcome(
  score: ScoreResult,
  opts: {
    facts: ScoringFacts;
    disqualifiers: ServiceLineProfile["disqualifiers"];
    lowScoreAction: "DISQUALIFY" | "NURTURE";
    throttleMode: "NORMAL" | "SLOW" | "PAUSED";
  },
): Outcome {
  const email = opts.facts.contactability.email;
  const assisted = opts.facts.contactability.hasAssistedChannel;

  // 1. Channel check (module spec §3.8).
  if (email === "BLOCKED" && !assisted) {
    return { status: "DISQUALIFIED", reason: "no_channel" };
  }
  if ((email === "CONSENT_REQUIRED" || email === "REVIEW") && !assisted) {
    return { status: "NURTURE", nurtureReason: "COMPLIANCE", reason: "COMPLIANCE" };
  }

  // 2. Profile disqualifiers with a condition (condition-less ones are judged by the AI/human review).
  for (const d of opts.disqualifiers) {
    if (d.condition !== undefined && evalCondition(d.condition, opts.facts)) {
      return { status: "DISQUALIFIED", reason: `disqualifier:${d.id}` };
    }
  }

  // 3. Band.
  if (score.band === "BELOW") {
    return opts.lowScoreAction === "NURTURE"
      ? { status: "NURTURE", nurtureReason: "LOW_SCORE", reason: "LOW_SCORE" }
      : { status: "DISQUALIFIED", reason: "low_score" };
  }

  // 4. QUALIFIED or BORDERLINE → SCORED, unless capacity is PAUSED.
  if (opts.throttleMode === "PAUSED") {
    return { status: "NURTURE", nurtureReason: "CAPACITY", reason: "CAPACITY" };
  }
  return { status: "SCORED" };
}
