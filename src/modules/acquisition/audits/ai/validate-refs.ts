/**
 * Evidence-reference validation for AI-judged audit findings (contract rule 3, INV-18/INV-24).
 * After every AI call, each finding's `evidenceRefs` must exist in the task input; a finding that
 * cites anything else is dropped and logged (the same discipline as `assertClaimsCited`).
 */

import "server-only";

import type { AuditAiFinding } from "./schemas";

export interface RefLogger {
  warn(msg: string, data?: Record<string, unknown>): void;
}

/** Keeps only findings whose every `evidenceRef` is in `allowedRefs`; logs each dropped finding. */
export function keepFindingsWithKnownRefs(
  findings: AuditAiFinding[],
  allowedRefs: readonly string[],
  log: RefLogger,
): AuditAiFinding[] {
  const allowed = new Set(allowedRefs);
  const kept: AuditAiFinding[] = [];
  for (const finding of findings) {
    const unknown = finding.evidenceRefs.filter((ref) => !allowed.has(ref));
    if (unknown.length > 0) {
      log.warn("Dropped AI audit finding citing references not in the input", {
        unknownRefCount: unknown.length,
      });
      continue;
    }
    kept.push(finding);
  }
  return kept;
}
