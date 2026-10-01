/**
 * Shared agent machinery: run a list of checks (independent, timed, error-isolated), compute the
 * agent status, and a domain-level cache helper.
 */

import "server-only";

import type {
  AuditCheckId,
  AuditCompanyInput,
  AuditContext,
  AuditFindingInput,
  AuditResult,
  CheckRunResultSchema,
} from "@/contracts/audit-agent";
import type { z } from "zod";

import type { CheckFn } from "../checks/types";

type CheckRunResult = z.infer<typeof CheckRunResultSchema>;
type CheckRunStatus = CheckRunResult["status"];
export type AgentRunStatus = AuditResult["status"];

/** Statuses that count as "satisfied" for a required check (contract rule 5). */
const SATISFIED: ReadonlySet<CheckRunStatus> = new Set(["OK", "NOT_APPLICABLE", "NOT_ASSESSED"]);

export interface NamedCheck {
  id: AuditCheckId;
  fn: CheckFn;
}

export interface RunChecksResult {
  checks: CheckRunResult[];
  findings: AuditFindingInput[];
  costMicros: number;
}

/** Runs checks in order, timing each and converting a thrown error into CHECK_FAILED. */
export async function runChecks(
  company: AuditCompanyInput,
  ctx: AuditContext,
  checks: NamedCheck[],
): Promise<RunChecksResult> {
  const runs: CheckRunResult[] = [];
  const findings: AuditFindingInput[] = [];
  let costMicros = 0;

  for (const check of checks) {
    if (ctx.signal.aborted) {
      runs.push({ checkId: check.id, status: "CHECK_FAILED", reason: "Aborted.", durationMs: 0, costMicros: 0 });
      continue;
    }
    const start = ctx.clock.now().getTime();
    try {
      const outcome = await check.fn(company, ctx);
      const durationMs = Math.max(0, ctx.clock.now().getTime() - start);
      runs.push({
        checkId: outcome.checkId,
        status: outcome.status,
        ...(outcome.reason === undefined ? {} : { reason: outcome.reason }),
        durationMs,
        costMicros: outcome.costMicros,
      });
      findings.push(...outcome.findings);
      costMicros += outcome.costMicros;
    } catch (err) {
      const durationMs = Math.max(0, ctx.clock.now().getTime() - start);
      ctx.log.warn("Audit check failed", { checkId: check.id });
      runs.push({
        checkId: check.id,
        status: "CHECK_FAILED",
        reason: err instanceof Error ? err.message.slice(0, 200) : "Unknown error.",
        durationMs,
        costMicros: 0,
      });
    }
  }

  return { checks: runs, findings, costMicros };
}

/** Whether every required check is satisfied (OK / NOT_APPLICABLE / NOT_ASSESSED). */
export function requiredChecksSatisfied(
  checks: CheckRunResult[],
  requiredChecks: ReadonlySet<AuditCheckId>,
): boolean {
  for (const run of checks) {
    if (requiredChecks.has(run.checkId) && !SATISFIED.has(run.status)) return false;
  }
  return true;
}

/** The agent-level status for the Audit row. */
export function computeAuditStatus(
  checks: CheckRunResult[],
  requiredChecks: ReadonlySet<AuditCheckId>,
): AgentRunStatus {
  if (checks.length > 0 && checks.every((c) => c.status === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
  if (!requiredChecksSatisfied(checks, requiredChecks)) return "FAILED";
  if (checks.some((c) => c.status === "CHECK_FAILED" || c.status === "SKIPPED_COST_CAP")) return "PARTIAL";
  return "SUCCEEDED";
}

/**
 * Reads a cached value for a company-scoped key, or produces and caches it. `force` bypasses the
 * cache. Results are stored under `<domainOrId>:<checkId>` for the configured TTL.
 */
export async function withDomainCache<T>(
  ctx: AuditContext,
  scopeKey: string,
  checkId: AuditCheckId,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<{ value: T; cacheHit: boolean }> {
  const cacheKey = `${scopeKey}:${checkId}`;
  if (!ctx.force) {
    const cached = await ctx.cache.get(cacheKey);
    if (cached !== null && cached !== undefined) return { value: cached as T, cacheHit: true };
  }
  const value = await produce();
  await ctx.cache.set(cacheKey, value, ttlSeconds);
  return { value, cacheHit: false };
}
