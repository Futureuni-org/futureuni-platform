/**
 * Shared types for audit checks. A check is an independent unit: it returns a `CheckOutcome` and
 * never throws for an expected failure (the agent runner turns a thrown error into `CHECK_FAILED`).
 */

import type { AuditCheckId, AuditCompanyInput, AuditContext, AuditFindingInput } from "@/contracts/audit-agent";
import type { z } from "zod";
import type { CheckRunResultSchema } from "@/contracts/audit-agent";

export type CheckRunStatus = z.infer<typeof CheckRunResultSchema>["status"];

export interface CheckOutcome {
  checkId: AuditCheckId;
  status: CheckRunStatus;
  reason?: string;
  costMicros: number;
  findings: AuditFindingInput[];
}

export type CheckFn = (company: AuditCompanyInput, ctx: AuditContext) => Promise<CheckOutcome>;

/** Convenience: an OK outcome with findings. */
export function ok(checkId: AuditCheckId, findings: AuditFindingInput[], costMicros = 0): CheckOutcome {
  return { checkId, status: "OK", costMicros, findings };
}

/** A check that found nothing to report, but ran successfully. */
export function okEmpty(checkId: AuditCheckId, costMicros = 0): CheckOutcome {
  return { checkId, status: "OK", costMicros, findings: [] };
}

export function notApplicable(checkId: AuditCheckId, reason: string): CheckOutcome {
  return { checkId, status: "NOT_APPLICABLE", reason, costMicros: 0, findings: [] };
}

export function notAssessed(checkId: AuditCheckId, reason: string): CheckOutcome {
  return { checkId, status: "NOT_ASSESSED", reason, costMicros: 0, findings: [] };
}

export function skippedCostCap(checkId: AuditCheckId): CheckOutcome {
  return { checkId, status: "SKIPPED_COST_CAP", reason: "Per-lead cost cap reached.", costMicros: 0, findings: [] };
}

export function checkFailed(checkId: AuditCheckId, reason: string, costMicros = 0): CheckOutcome {
  return { checkId, status: "CHECK_FAILED", reason: reason.slice(0, 200), costMicros, findings: [] };
}
