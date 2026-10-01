/**
 * Database access for the audit tables (`acq_audits`, `acq_audit_check_runs`, `acq_audit_findings`,
 * `acq_audit_cache_entries`). The only place Phase 10 touches Prisma for audits (naming rule:
 * `*.repo.ts`).
 */

import "server-only";

import type {
  AuditFindingInput,
  CheckRunResultSchema,
} from "@/contracts/audit-agent";
import type { ServiceLine } from "@/contracts/common";
import type { z } from "zod";
import { db, toJsonInput, type Audit, type AuditFinding } from "@/platform/db";

type CheckRunResult = z.infer<typeof CheckRunResultSchema>;
type AuditRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "NOT_APPLICABLE";

/** Opens an Audit row for an agent run (status RUNNING, attempt from the previous row + 1). */
export async function startAudit(input: {
  leadId: string;
  companyId: string;
  agentId: string;
  serviceLine: ServiceLine;
  attempt: number;
  jobRunId?: string;
  now: Date;
}): Promise<{ id: string }> {
  const row = await db.audit.create({
    data: {
      leadId: input.leadId,
      companyId: input.companyId,
      agentId: input.agentId,
      serviceLine: input.serviceLine,
      status: "RUNNING",
      attempt: input.attempt,
      startedAt: input.now,
      ...(input.jobRunId === undefined ? {} : { jobRunId: input.jobRunId }),
    },
    select: { id: true },
  });
  return row;
}

/** Finalises an Audit row and writes its check runs and findings. */
export async function finishAudit(input: {
  auditId: string;
  leadId: string;
  companyId: string;
  status: AuditRunStatus;
  costMicros: number;
  cacheHit: boolean;
  error?: string;
  checks: CheckRunResult[];
  findings: AuditFindingInput[];
  now: Date;
}): Promise<void> {
  await db.audit.update({
    where: { id: input.auditId },
    data: {
      status: input.status,
      costMicros: input.costMicros,
      cacheHit: input.cacheHit,
      finishedAt: input.now,
      ...(input.error === undefined ? {} : { error: input.error.slice(0, 500) }),
    },
  });

  if (input.checks.length > 0) {
    await db.auditCheckRun.createMany({
      data: input.checks.map((check) => ({
        auditId: input.auditId,
        checkId: check.checkId,
        status: check.status,
        ...(check.reason === undefined ? {} : { reason: check.reason }),
        durationMs: check.durationMs,
        costMicros: check.costMicros,
      })),
    });
  }

  if (input.findings.length > 0) {
    await db.auditFinding.createMany({
      data: input.findings.map((finding) => ({
        auditId: input.auditId,
        leadId: input.leadId,
        companyId: input.companyId,
        checkId: finding.checkId,
        severity: finding.severity,
        claim: finding.claim,
        evidence: toJsonInput(finding.evidence),
        ...(finding.sourceUrl === undefined ? {} : { sourceUrl: finding.sourceUrl }),
        ...(finding.artifactKey === undefined ? {} : { artifactKey: finding.artifactKey }),
        capturedAt: new Date(finding.capturedAt),
        method: finding.method,
        confidence: finding.confidence,
        pitchable: finding.pitchable,
      })),
    });
  }
}

/** How many times this agent has already run for the lead (for the attempt number and retry cap). */
export async function countAuditAttempts(leadId: string, agentId: string): Promise<number> {
  return db.audit.count({ where: { leadId, agentId } });
}

export interface AuditWithChildren extends Audit {
  checkRuns: { id: string; checkId: string; status: string; reason: string | null; durationMs: number | null; costMicros: number }[];
  findings: AuditFinding[];
}

/** Every audit for a lead with its check runs and non-dismissed-aware findings (newest first). */
export async function findAuditsForLead(leadId: string): Promise<AuditWithChildren[]> {
  return db.audit.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    include: {
      checkRuns: {
        select: { id: true, checkId: true, status: true, reason: true, durationMs: true, costMicros: true },
      },
      findings: { orderBy: [{ pitchable: "desc" }, { severity: "desc" }] },
    },
  });
}

export async function findFinding(id: string): Promise<AuditFinding | null> {
  return db.auditFinding.findUnique({ where: { id } });
}

/**
 * Clears prior audit rows for a lead+agent so a re-run doesn't duplicate findings, while preserving
 * any finding already cited by a message (INV-18: a cited finding is immutable). An audit that still
 * has cited findings is kept; one with none left is removed with its check runs.
 */
export async function clearPriorAgentAudits(leadId: string, agentId: string): Promise<void> {
  const audits = await db.audit.findMany({ where: { leadId, agentId }, select: { id: true } });
  for (const audit of audits) {
    await db.auditFinding.deleteMany({ where: { auditId: audit.id, citations: { none: {} } } });
    const remaining = await db.auditFinding.count({ where: { auditId: audit.id } });
    if (remaining === 0) {
      await db.auditCheckRun.deleteMany({ where: { auditId: audit.id } });
      await db.audit.delete({ where: { id: audit.id } });
    }
  }
}

// ---------- Domain-level cache (AuditCacheEntry) ----------

/** Returns the cached result for a key if it hasn't expired, else null. */
export async function getCacheEntry(cacheKey: string, now: Date): Promise<unknown> {
  const row = await db.auditCacheEntry.findUnique({ where: { cacheKey } });
  if (row === null) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  return row.result;
}

/** Upserts a cache entry. `cacheKey` is a plain unique index, so upsert is safe here. */
export async function setCacheEntry(input: {
  cacheKey: string;
  domain: string;
  checkId: string;
  result: unknown;
  capturedAt: Date;
  expiresAt: Date;
}): Promise<void> {
  await db.auditCacheEntry.upsert({
    where: { cacheKey: input.cacheKey },
    create: {
      cacheKey: input.cacheKey,
      domain: input.domain,
      checkId: input.checkId,
      result: toJsonInput(input.result),
      capturedAt: input.capturedAt,
      expiresAt: input.expiresAt,
    },
    update: {
      result: toJsonInput(input.result),
      capturedAt: input.capturedAt,
      expiresAt: input.expiresAt,
    },
  });
}
