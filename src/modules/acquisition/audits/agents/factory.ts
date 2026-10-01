/**
 * Factory for agents that simply run every configured check (no short-circuit). Each check guards its
 * own prerequisites and reports NOT_APPLICABLE / NOT_ASSESSED honestly.
 */

import "server-only";

import type {
  AuditAgent,
  AuditAgentId,
  AuditCheckDefinitionSchema,
  AuditContext,
  AuditResult,
} from "@/contracts/audit-agent";
import type { ServiceLine } from "@/contracts/common";
import type { z } from "zod";

import type { CheckFn } from "../checks/types";
import { computeAuditStatus, runChecks, type NamedCheck } from "./support";

export type CheckDef = z.infer<typeof AuditCheckDefinitionSchema>;

export function makeSimpleAgent(
  id: AuditAgentId,
  serviceLine: ServiceLine,
  checks: CheckDef[],
  fns: Record<string, CheckFn>,
): AuditAgent {
  const order: NamedCheck[] = checks
    .map((c) => ({ id: c.id, fn: fns[c.id] }))
    .filter((x): x is NamedCheck => x.fn !== undefined);
  return {
    id,
    serviceLine,
    checks,
    async run(company, ctx: AuditContext): Promise<AuditResult> {
      const res = await runChecks(company, ctx, order);
      return {
        agentId: id,
        status: computeAuditStatus(res.checks, ctx.requiredChecks),
        checks: res.checks,
        findings: res.findings,
        costMicros: res.costMicros,
      };
    },
  };
}
