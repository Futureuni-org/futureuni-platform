/**
 * `runAudits(leadId, …)` — the audit orchestration (contract §4 rule 5):
 *  1. ENRICHED → AUDITING.
 *  2. Run each configured agent within a per-lead cost cap and a shared domain cache.
 *  3. Store one Audit row per agent with its check runs and (validated) findings.
 *  4. If every required check is satisfied → AUDITING → AUDITED; otherwise count the failure and
 *     rebound to ENRICHED (so the batch re-picks it) until the max, then flag for manual review.
 *  5. Emit `audit.completed`.
 */

import "server-only";

import {
  AuditFindingInputSchema,
  type AuditCompanyInput,
  type AuditFindingInput,
} from "@/contracts/audit-agent";
import type { Actor } from "@/contracts/common";
import { transitionLead } from "@/modules/acquisition/core";
import { getActiveProfile } from "@/modules/acquisition/profiles";
import { db, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";

import { clearPriorAgentAudits, finishAudit, startAudit } from "../audit.repo";
import { getAuditConfig } from "../config";
import { AUDIT_AGENTS } from "../agents/registry";
import { requiredChecksSatisfied, type AgentRunStatus } from "../agents/support";
import { createAuditCache } from "./cache";
import { createCostMeter } from "./cost-meter";
import {
  buildAuditContext,
  defaultAuditLogger,
  requiredChecksFor,
  type AuditLogger,
} from "./context";

export interface RunAuditsInput {
  leadId: string;
  actor: Actor;
  jobRunId?: string;
  force?: boolean;
  now?: () => Date;
  signal?: AbortSignal;
  log?: AuditLogger;
}

export interface RunAuditsResult {
  leadId: string;
  status: AgentRunStatus;
  auditIds: string[];
  findingCount: number;
  pitchableCount: number;
  finalLeadStatus: string;
}

type AgentId = keyof typeof AUDIT_AGENTS;

function toCompanyInput(company: {
  id: string;
  name: string;
  website: string | null;
  normalizedDomain: string | null;
  websiteKind: string;
  country: string | null;
  city: string | null;
  socials: unknown;
  techHints: unknown;
  sourceRefs: { adapterId: string; externalId: string; url: string | null }[];
}): AuditCompanyInput {
  return {
    id: company.id,
    name: company.name,
    website: company.website,
    normalizedDomain: company.normalizedDomain,
    websiteKind: company.websiteKind,
    country: company.country,
    city: company.city,
    socials: (company.socials as Record<string, string | undefined> | null) ?? {},
    techHints: (company.techHints as Record<string, unknown> | null) ?? null,
    externalRefs: company.sourceRefs.map((r) => ({
      adapterId: r.adapterId,
      externalId: r.externalId,
      ...(r.url === null ? {} : { url: r.url }),
    })),
  };
}

function worstStatus(statuses: AgentRunStatus[]): AgentRunStatus {
  if (statuses.includes("FAILED")) return "FAILED";
  if (statuses.includes("PARTIAL")) return "PARTIAL";
  if (statuses.length > 0 && statuses.every((s) => s === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
  return "SUCCEEDED";
}

export async function runAudits(input: RunAuditsInput): Promise<RunAuditsResult> {
  const now = input.now ?? (() => new Date());
  const clock = { now };
  const log = input.log ?? defaultAuditLogger;
  const signal = input.signal ?? new AbortController().signal;

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, status: true, companyId: true, serviceLine: true, market: true, country: true, auditFailureCount: true },
  });
  if (lead === null) {
    return { leadId: input.leadId, status: "FAILED", auditIds: [], findingCount: 0, pitchableCount: 0, finalLeadStatus: "UNKNOWN" };
  }

  const canRun = lead.status === "ENRICHED" || lead.status === "AUDITING" || (lead.status === "AUDITED" && input.force === true);
  if (!canRun) {
    return { leadId: input.leadId, status: "NOT_APPLICABLE", auditIds: [], findingCount: 0, pitchableCount: 0, finalLeadStatus: lead.status };
  }
  const reaudit = lead.status === "AUDITED";

  const company = await db.company.findUniqueOrThrow({
    where: { id: lead.companyId },
    select: {
      id: true, name: true, website: true, normalizedDomain: true, websiteKind: true,
      country: true, city: true, socials: true, techHints: true,
      sourceRefs: { select: { adapterId: true, externalId: true, url: true } },
    },
  });
  const companyInput = toCompanyInput(company);
  const profile = await getActiveProfile(lead.serviceLine);
  const config = await getAuditConfig();

  // ENRICHED → AUDITING (the normal entry; a retry is already AUDITING; a re-audit stays AUDITED).
  if (lead.status === "ENRICHED") {
    await withTransaction((tx) =>
      transitionLead(tx, { leadId: lead.id, to: "AUDITING", actor: input.actor, reason: "audits:start" }),
    );
  }

  // Shared across all agents for this lead: one cost cap and one domain cache.
  const costMeter = createCostMeter(config.perLeadCostCapMicros);
  const cache = createAuditCache(clock);
  const force = input.force ?? false;

  const auditIds: string[] = [];
  const agentStatuses: AgentRunStatus[] = [];
  let requiredSatisfied = true;
  let findingCount = 0;
  let pitchableCount = 0;

  for (const agentConfig of profile.audits) {
    const agent = AUDIT_AGENTS[agentConfig.agentId] as (typeof AUDIT_AGENTS)[AgentId] | undefined;
    if (agent === undefined) continue;

    await clearPriorAgentAudits(lead.id, agent.id);
    const { countAuditAttempts } = await import("../audit.repo");
    const attempt = await countAuditAttempts(lead.id, agent.id);
    const audit = await startAudit({
      leadId: lead.id,
      companyId: company.id,
      agentId: agent.id,
      serviceLine: lead.serviceLine,
      attempt,
      ...(input.jobRunId === undefined ? {} : { jobRunId: input.jobRunId }),
      now: now(),
    });
    auditIds.push(audit.id);

    const requiredChecks = requiredChecksFor(profile, agent);
    const ctx = buildAuditContext({
      lead: { id: lead.id, serviceLine: lead.serviceLine, market: lead.market, country: lead.country },
      profile,
      requiredChecks,
      costMeter,
      cache,
      clock,
      signal,
      force,
      log,
    });

    const result = await agent.run(companyInput, ctx);

    // Validate every finding (INV-18: a finding needs evidence plus a source/artifact).
    const validFindings: AuditFindingInput[] = [];
    for (const finding of result.findings) {
      const parsed = AuditFindingInputSchema.safeParse(finding);
      if (parsed.success) validFindings.push(parsed.data);
      else log.warn("Dropped invalid audit finding", { checkId: finding.checkId });
    }
    findingCount += validFindings.length;
    pitchableCount += validFindings.filter((f) => f.pitchable).length;

    await finishAudit({
      auditId: audit.id,
      leadId: lead.id,
      companyId: company.id,
      status: result.status,
      costMicros: result.costMicros,
      cacheHit: false,
      checks: result.checks,
      findings: validFindings,
      now: now(),
    });

    agentStatuses.push(result.status);
    if (!requiredChecksSatisfied(result.checks, requiredChecks)) requiredSatisfied = false;
  }

  const overall = worstStatus(agentStatuses);
  const finalLeadStatus = await finalizeLead({
    lead,
    reaudit,
    requiredSatisfied,
    overall,
    auditIds,
    findingCount,
    pitchableCount,
    maxFailures: config.maxRequiredFailures,
    actor: input.actor,
    now: now(),
  });

  return { leadId: lead.id, status: overall, auditIds, findingCount, pitchableCount, finalLeadStatus };
}

async function finalizeLead(params: {
  lead: { id: string; status: string; auditFailureCount: number };
  reaudit: boolean;
  requiredSatisfied: boolean;
  overall: AgentRunStatus;
  auditIds: string[];
  findingCount: number;
  pitchableCount: number;
  maxFailures: number;
  actor: Actor;
  now: Date;
}): Promise<string> {
  const emitCompleted = (tx: Tx): Promise<unknown> =>
    publishAfterCommit(tx, {
      name: "audit.completed",
      actor: params.actor,
      payload: {
        leadId: params.lead.id,
        auditIds: params.auditIds,
        status: params.overall,
        findingCount: params.findingCount,
        pitchableCount: params.pitchableCount,
      },
    });

  // Re-audit of an already-AUDITED lead: refresh findings, keep status, just emit the event.
  if (params.reaudit) {
    await withTransaction(async (tx) => {
      await emitCompleted(tx);
    });
    return "AUDITED";
  }

  if (params.requiredSatisfied) {
    await withTransaction(async (tx) => {
      await transitionLead(tx, { leadId: params.lead.id, to: "AUDITED", actor: params.actor, reason: "audits:done", meta: { findingCount: params.findingCount, pitchableCount: params.pitchableCount } });
      await tx.lead.update({ where: { id: params.lead.id }, data: { auditFailureCount: 0 } });
      await emitCompleted(tx);
    });
    return "AUDITED";
  }

  // Required failure: rebound to ENRICHED. At the max, flag for manual review.
  const newCount = params.lead.auditFailureCount + 1;
  const flagged = newCount >= params.maxFailures;
  await withTransaction(async (tx) => {
    await transitionLead(tx, {
      leadId: params.lead.id,
      to: "ENRICHED",
      actor: params.actor,
      reason: flagged ? "audits:failed-max" : "audits:retry",
    });
    await tx.lead.update({
      where: { id: params.lead.id },
      data: { auditFailureCount: newCount, ...(flagged ? { needsAttentionAt: params.now } : {}) },
    });
    await emitCompleted(tx);
    if (flagged) {
      await publishAfterCommit(tx, {
        name: "lead.needsAttention",
        actor: params.actor,
        payload: { leadId: params.lead.id, reason: "audit_failed", restarts: newCount },
      });
    }
  });
  return "ENRICHED";
}
