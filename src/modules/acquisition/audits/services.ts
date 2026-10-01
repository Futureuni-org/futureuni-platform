/**
 * Audit services for Phase 16 and the rerun/dismiss flows. Each one authenticates the actor against
 * the lead's scope, and the mutations are audited (INV-20). Dismissed findings can never be cited
 * (INV-18).
 */

import "server-only";

import type { Actor, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { db, withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { getSignedUrl } from "@/platform/storage";

import { findAuditsForLead, findFinding, type AuditWithChildren } from "./audit.repo";
import { runAudits, type RunAuditsResult } from "./orchestration/run-audits";

const ARTIFACT_URL_TTL_SECONDS = 600;

async function leadScope(leadId: string): Promise<{ serviceLine: ServiceLine; ownerId: string | null }> {
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { serviceLine: true, ownerId: true } });
  if (lead === null) throw new AppError("NOT_FOUND", `Lead ${leadId} not found.`);
  return lead;
}

export interface FindingView {
  id: string;
  checkId: string;
  severity: string;
  claim: string;
  method: string;
  confidence: number;
  pitchable: boolean;
  sourceUrl: string | null;
  artifactKey: string | null;
  artifactUrl: string | null;
  dismissedAt: Date | null;
  capturedAt: Date;
}

export interface AuditView {
  id: string;
  agentId: string;
  status: string;
  costMicros: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  checkRuns: AuditWithChildren["checkRuns"];
  findings: FindingView[];
}

async function signArtifact(key: string | null): Promise<string | null> {
  if (key === null) return null;
  try {
    return await getSignedUrl(key, ARTIFACT_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

/** All audits for a lead, with findings and signed artifact URLs. Requires `acquisition.lead.read`. */
export async function getAuditsForLead(actor: Actor, leadId: string): Promise<AuditView[]> {
  const scope = await leadScope(leadId);
  await assertActorCan(actor, "acquisition.lead.read", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });

  const audits = await findAuditsForLead(leadId);
  const views: AuditView[] = [];
  for (const a of audits) {
    const findings: FindingView[] = [];
    for (const f of a.findings) {
      findings.push({
        id: f.id,
        checkId: f.checkId,
        severity: f.severity,
        claim: f.claim,
        method: f.method,
        confidence: f.confidence,
        pitchable: f.pitchable,
        sourceUrl: f.sourceUrl,
        artifactKey: f.artifactKey,
        artifactUrl: await signArtifact(f.artifactKey),
        dismissedAt: f.dismissedAt,
        capturedAt: f.capturedAt,
      });
    }
    views.push({
      id: a.id,
      agentId: a.agentId,
      status: a.status,
      costMicros: a.costMicros,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      checkRuns: a.checkRuns,
      findings,
    });
  }
  return views;
}

/** One finding with a signed artifact URL. Requires `acquisition.lead.read`. */
export async function getFinding(actor: Actor, findingId: string): Promise<FindingView> {
  const finding = await findFinding(findingId);
  if (finding === null) throw new AppError("NOT_FOUND", `Finding ${findingId} not found.`);
  const scope = await leadScope(finding.leadId);
  await assertActorCan(actor, "acquisition.lead.read", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  return {
    id: finding.id,
    checkId: finding.checkId,
    severity: finding.severity,
    claim: finding.claim,
    method: finding.method,
    confidence: finding.confidence,
    pitchable: finding.pitchable,
    sourceUrl: finding.sourceUrl,
    artifactKey: finding.artifactKey,
    artifactUrl: await signArtifact(finding.artifactKey),
    dismissedAt: finding.dismissedAt,
    capturedAt: finding.capturedAt,
  };
}

/** Re-runs a lead's audits (force-refresh). Requires `acquisition.lead.reaudit`; audited. */
export async function rerunAudit(actor: Actor, leadId: string): Promise<RunAuditsResult> {
  const scope = await leadScope(leadId);
  await assertActorCan(actor, "acquisition.lead.reaudit", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  await withTransaction((tx) =>
    audit.record(tx, { actor, action: "acquisition.lead.reaudit", targetType: "Lead", targetId: leadId }),
  );
  return runAudits({ leadId, actor, force: true });
}

/** Dismisses a finding so it can never be cited (INV-18). Requires `acquisition.finding.dismiss`; audited. */
export async function dismissFinding(actor: Actor, findingId: string, reason: string): Promise<void> {
  if (reason.trim().length === 0) throw new AppError("VALIDATION_FAILED", "A dismissal reason is required.");
  const finding = await findFinding(findingId);
  if (finding === null) throw new AppError("NOT_FOUND", `Finding ${findingId} not found.`);
  const scope = await leadScope(finding.leadId);
  await assertActorCan(actor, "acquisition.finding.dismiss", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  if (finding.dismissedAt !== null) return; // idempotent

  const dismissedById = actor.type === "USER" ? actor.userId : null;
  await withTransaction(async (tx) => {
    await tx.auditFinding.update({
      where: { id: findingId },
      data: { dismissedAt: new Date(), dismissReason: reason.slice(0, 500), ...(dismissedById === null ? {} : { dismissedById }) },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.finding.dismiss",
      targetType: "AuditFinding",
      targetId: findingId,
      after: { reason: reason.slice(0, 200), checkId: finding.checkId },
    });
    await publishAfterCommit(tx, {
      name: "finding.dismissed",
      actor,
      payload: { findingId, leadId: finding.leadId },
    });
  });
}
