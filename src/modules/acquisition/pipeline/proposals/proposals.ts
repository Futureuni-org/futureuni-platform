/**
 * Proposals service (module spec §3.13 "Proposals"). Deterministic pricing (INV-11, INV-17), the
 * AI drafting task with the number-consistency check, the approval rules, the branded PDF, sending
 * through the outreach thread, and accept / decline / expiry.
 *
 * Prices are computed only by `./pricing`; the model restates figures and a mismatch is rejected.
 */

import "server-only";

import type { ProposalSections } from "@/contracts/acquisition-records";
import type { Actor, Clock, Currency } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { runTask, stripCitationMarkers } from "@/platform/ai";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { putFile } from "@/platform/storage";

import { transitionLead } from "@/modules/acquisition/core";

import { sendOneOffEmail } from "../_seams";
import * as repo from "../pipeline.repo";
import { getProfileContext, type ProfileContext } from "../profile-context";
import { PIPELINE_NOTIFICATION_TYPES } from "../notifications";
import { getDiscountApprovalThresholdBps, getProposalValidityDays, getTaxSettings } from "../settings";
import { notifySafe, pipelineLog, publishStatusChanged } from "../shared";
import { ProposalDraftInputSchema, proposalDraftTask } from "../tasks";
import { checkNumbersConsistent, formatDocDate } from "./number-check";
import { effectiveDiscountBps, priceProposal, type PricedProposal } from "./pricing";

const PROPOSAL_TARGET = "acquisition.proposal";

function clockNow(clock?: Clock): Date {
  return (clock ?? { now: () => new Date() }).now();
}

export interface ProposalPackageInput {
  packageId: string;
  quantity?: number;
  unitPriceMinor?: number;
}
export interface ProposalLineItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}
export interface ProposalDiscountInput {
  type: "NONE" | "PERCENT" | "AMOUNT";
  valueBps?: number;
  valueMinor?: number;
}
export interface CreateProposalInput {
  packages: ProposalPackageInput[];
  lineItems?: ProposalLineItemInput[];
  discount?: ProposalDiscountInput;
  validUntil?: Date;
  notes?: string | null;
  timelineSummary?: string;
}

export interface ProposalResult {
  proposalId: string;
  proposalGroupId: string;
  version: number;
  requiresApproval: boolean;
  totalMinor: number;
  currency: Currency;
}

interface ResolvedSelection {
  packageId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  currency: Currency;
  withinRange: boolean;
}

interface BuiltProposal {
  priced: PricedProposal;
  selections: ResolvedSelection[];
  lineItems: ProposalLineItemInput[];
  discount: ProposalDiscountInput;
  requiresApproval: boolean;
  approvalReason: string | null;
  sections: ProposalSections;
  aiCallId: string | null;
  validUntil: Date;
  taxRateBps: number;
  context: ProfileContext;
}

function discountToPricing(discount: ProposalDiscountInput) {
  if (discount.type === "PERCENT") return { type: "PERCENT" as const, valueBps: discount.valueBps ?? 0 };
  if (discount.type === "AMOUNT") return { type: "AMOUNT" as const, valueMinor: discount.valueMinor ?? 0 };
  return { type: "NONE" as const };
}

/** Resolves selected packages against the profile, prices them, drafts the prose, and validates numbers. */
async function buildProposal(
  actor: Actor,
  scope: repo.LeadScope,
  input: CreateProposalInput,
  now: Date,
): Promise<BuiltProposal> {
  const meta = await repo.getCompanyMeta(scope.companyId);
  const context = await getProfileContext(scope.serviceLine, scope.market, meta?.country ?? null);

  const selections: ResolvedSelection[] = input.packages.map((pkg) => {
    const profilePkg = context.packages.find((p) => p.id === pkg.packageId);
    if (profilePkg === undefined) {
      throw new AppError("VALIDATION_FAILED", `Unknown package "${pkg.packageId}" for this line and market.`);
    }
    const quantity = pkg.quantity ?? 1;
    const unitPriceMinor = pkg.unitPriceMinor ?? profilePkg.typicalMinor;
    const withinRange = unitPriceMinor >= profilePkg.minMinor && unitPriceMinor <= profilePkg.maxMinor;
    return { packageId: pkg.packageId, name: profilePkg.name, quantity, unitPriceMinor, currency: context.currency, withinRange };
  });

  const lineItems = input.lineItems ?? [];
  const discount = input.discount ?? { type: "NONE" };
  const tax = await getTaxSettings();

  const priced = priceProposal({
    market: scope.market,
    currency: context.currency,
    packages: selections.map((s) => ({ packageId: s.packageId, name: s.name, quantity: s.quantity, unitPriceMinor: s.unitPriceMinor })),
    lineItems,
    discount: discountToPricing(discount),
    tax: { enabled: tax.enabled, rateBps: tax.rateBps },
  });

  const thresholdBps = await getDiscountApprovalThresholdBps();
  const discountBps = effectiveDiscountBps(priced);
  const outOfRange = selections.filter((s) => !s.withinRange);
  const requiresApproval = discountBps > thresholdBps || outOfRange.length > 0;
  const approvalReason = requiresApproval
    ? discountBps > thresholdBps
      ? `Discount ${(discountBps / 100).toFixed(1)}% exceeds the ${(thresholdBps / 100).toFixed(1)}% threshold.`
      : `Package(s) priced outside range: ${outOfRange.map((s) => s.packageId).join(", ")}.`
    : null;

  const validUntil = input.validUntil ?? new Date(now.getTime() + (await getProposalValidityDays()) * 24 * 60 * 60 * 1000);

  const { sections, aiCallId } = await draftSections(actor, scope, input, priced, context, validUntil);

  return {
    priced,
    selections,
    lineItems,
    discount,
    requiresApproval,
    approvalReason,
    sections,
    aiCallId,
    validUntil,
    taxRateBps: priced.taxRateBps,
    context,
  };
}

/** Runs the proposal-draft task and enforces the number-consistency check (one repair, then error). */
async function draftSections(
  actor: Actor,
  scope: repo.LeadScope,
  input: CreateProposalInput,
  priced: PricedProposal,
  context: ProfileContext,
  validUntil: Date,
): Promise<{ sections: ProposalSections; aiCallId: string | null }> {
  const [brief, company, summaries] = await Promise.all([
    repo.getLeadBriefFields(scope.id),
    repo.getCompanySnapshot(scope.companyId),
    repo.listMeetingSummariesForLead(scope.id),
  ]);
  const findings = await repo.getFindingsForLead(scope.id, brief?.keyFindingIds ?? []);
  const meetingSummary = summaries
    .map((s) => (s.summary !== null && typeof s.summary === "object" ? (s.summary as { summary?: string }).summary ?? "" : ""))
    .filter((t) => t !== "")
    .join("\n\n");

  const draftInput = ProposalDraftInputSchema.parse({
    serviceLine: scope.serviceLine,
    market: scope.market,
    companyName: company?.name ?? "the company",
    leadBrief: brief?.brief ?? null,
    meetingSummary: meetingSummary === "" ? null : meetingSummary,
    findings,
    packages: priced.lines
      .filter((l) => l.kind === "PACKAGE")
      .map((l) => ({ name: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor })),
    lineItems: priced.lines
      .filter((l) => l.kind === "CUSTOM")
      .map((l) => ({ description: l.description, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor })),
    totals: {
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      taxMinor: priced.taxMinor,
      totalMinor: priced.totalMinor,
      currency: priced.currency,
    },
    catalogue: context.catalogue,
    portfolio: context.portfolio,
    timelineSummary: input.timelineSummary ?? "A typical engagement runs over a few weeks from kick-off.",
    validUntil: formatDocDate(validUntil),
  });

  const allowedAmounts = collectAllowedAmounts(priced);
  const allowedDates = [formatDocDate(validUntil)];

  let lastCallId: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await runTask<unknown, ProposalSections>({
      task: proposalDraftTask.id,
      input: draftInput,
      actor,
      context: { leadId: scope.id, companyId: scope.companyId, module: "acquisition" },
    });
    lastCallId = result.callId;
    const sections = stripSections(result.output);
    const text = Object.values(sections).join("\n\n");
    const check = checkNumbersConsistent({ text, currency: priced.currency, allowedAmountsMinor: allowedAmounts, allowedDates });
    if (check.ok) return { sections, aiCallId: lastCallId };
  }
  throw new AppError("AI_OUTPUT_INVALID", "The proposal text kept stating figures that don't match the quote.");
}

function stripSections(sections: ProposalSections): ProposalSections {
  return {
    understanding: stripCitationMarkers(sections.understanding),
    solution: stripCitationMarkers(sections.solution),
    scope: stripCitationMarkers(sections.scope),
    timeline: stripCitationMarkers(sections.timeline),
    investmentIntro: stripCitationMarkers(sections.investmentIntro),
    whyFutureuni: stripCitationMarkers(sections.whyFutureuni),
    terms: stripCitationMarkers(sections.terms),
    nextSteps: stripCitationMarkers(sections.nextSteps),
  };
}

function collectAllowedAmounts(priced: PricedProposal): number[] {
  const amounts = new Set<number>([priced.subtotalMinor, priced.discountMinor, priced.taxMinor, priced.totalMinor]);
  for (const line of priced.lines) {
    amounts.add(line.unitPriceMinor);
    amounts.add(line.totalMinor);
  }
  return [...amounts];
}

export async function createProposal(
  actor: Actor,
  leadId: string,
  input: CreateProposalInput,
  clock?: Clock,
): Promise<ProposalResult> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.proposal.create", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  if (input.packages.length === 0 && (input.lineItems?.length ?? 0) === 0) {
    throw new AppError("VALIDATION_FAILED", "A proposal needs at least one package or line item.");
  }
  const actorId = actor.type === "USER" ? actor.userId : null;
  if (actorId === null) throw new AppError("FORBIDDEN", "A proposal must be created by a user.");

  const built = await buildProposal(actor, scope, input, clockNow(clock));

  return withTransaction(async (tx) => {
    const proposal = await persistProposal(tx, scope.id, null, 1, built, input.notes ?? null, actorId);
    await audit.record(tx, {
      actor,
      action: "acquisition.proposal.create",
      targetType: PROPOSAL_TARGET,
      targetId: proposal.id,
      after: { totalMinor: built.priced.totalMinor, currency: built.priced.currency, requiresApproval: built.requiresApproval },
    });
    if (built.requiresApproval) await notifyApprovalNeeded(scope, proposal.id);
    return {
      proposalId: proposal.id,
      proposalGroupId: proposal.proposalGroupId,
      version: proposal.version,
      requiresApproval: built.requiresApproval,
      totalMinor: built.priced.totalMinor,
      currency: built.priced.currency,
    };
  });
}

export async function reviseProposal(
  actor: Actor,
  proposalId: string,
  input: CreateProposalInput,
  clock?: Clock,
): Promise<ProposalResult> {
  const existing = await repo.getProposalWithLead(proposalId);
  if (existing === null) throw new AppError("NOT_FOUND", "That proposal doesn't exist.");
  const scope = existing.lead;
  await assertActorCan(actor, "acquisition.proposal.create", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  const actorId = actor.type === "USER" ? actor.userId : null;
  if (actorId === null) throw new AppError("FORBIDDEN", "A proposal must be created by a user.");

  const built = await buildProposal(actor, scope, input, clockNow(clock));
  const nextVersion = (await repo.getLatestVersion(existing.proposalGroupId)) + 1;

  return withTransaction(async (tx) => {
    await repo.supersedeProposal(tx, existing.id);
    const proposal = await persistProposal(tx, scope.id, existing.proposalGroupId, nextVersion, built, input.notes ?? null, actorId);
    await audit.record(tx, {
      actor,
      action: "acquisition.proposal.create",
      targetType: PROPOSAL_TARGET,
      targetId: proposal.id,
      after: { revisionOf: existing.id, version: nextVersion },
    });
    if (built.requiresApproval) await notifyApprovalNeeded(scope, proposal.id);
    return {
      proposalId: proposal.id,
      proposalGroupId: proposal.proposalGroupId,
      version: proposal.version,
      requiresApproval: built.requiresApproval,
      totalMinor: built.priced.totalMinor,
      currency: built.priced.currency,
    };
  });
}

async function persistProposal(
  tx: Tx,
  leadId: string,
  proposalGroupId: string | null,
  version: number,
  built: BuiltProposal,
  notes: string | null,
  createdById: string,
) {
  const discountType = built.discount.type;
  const discountValue =
    discountType === "PERCENT" ? built.discount.valueBps ?? 0 : discountType === "AMOUNT" ? built.discount.valueMinor ?? 0 : 0;
  return repo.createProposal(tx, {
    leadId,
    proposalGroupId,
    version,
    currency: built.priced.currency,
    packages: built.selections,
    discountType,
    discountValue,
    subtotalMinor: built.priced.subtotalMinor,
    discountMinor: built.priced.discountMinor,
    taxRateBps: built.priced.taxRateBps,
    taxMinor: built.priced.taxMinor,
    totalMinor: built.priced.totalMinor,
    validUntil: built.validUntil,
    sections: built.sections,
    notes,
    requiresApproval: built.requiresApproval,
    approvalReason: built.approvalReason,
    aiCallId: built.aiCallId,
    createdById,
    lineItems: [
      ...built.priced.lines.map((line, index) => ({
        packageId: line.packageId,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        totalMinor: line.totalMinor,
        sortOrder: index,
      })),
    ],
  });
}

async function notifyApprovalNeeded(scope: repo.LeadScope, proposalId: string): Promise<void> {
  await notifySafe({
    serviceLine: scope.serviceLine,
    role: "MANAGER",
    type: PIPELINE_NOTIFICATION_TYPES.proposalApprovalNeeded,
    title: "A proposal needs approval",
    dedupeKey: `proposal.approval-needed:${proposalId}`,
  });
}

export async function approveProposal(actor: Actor, proposalId: string): Promise<void> {
  const proposal = await repo.getProposalWithLead(proposalId);
  if (proposal === null) throw new AppError("NOT_FOUND", "That proposal doesn't exist.");
  if (proposal.status !== "DRAFT" && proposal.status !== "PENDING_APPROVAL") {
    throw new AppError("CONFLICT", "Only a draft or pending proposal can be approved.");
  }
  const scope = proposal.lead;
  // An exception (discount above threshold or total outside range) needs MANAGER/ADMIN.
  const action = proposal.requiresApproval ? "acquisition.proposal.approveException" : "acquisition.proposal.approve";
  await assertActorCan(actor, action, { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  const actorId = actor.type === "USER" ? actor.userId : null;

  await withTransaction(async (tx) => {
    await repo.updateProposal(tx, proposalId, { status: "APPROVED", approvedById: actorId, approvedAt: new Date() });
    await audit.record(tx, {
      actor,
      action,
      targetType: PROPOSAL_TARGET,
      targetId: proposalId,
      after: { status: "APPROVED" },
    });
  });
}

export interface SendProposalInput {
  contactId: string;
  message: string;
}

export async function sendProposal(
  actor: Actor,
  proposalId: string,
  input: SendProposalInput,
  clock?: Clock,
): Promise<{ messageId: string }> {
  const proposal = await repo.getProposalWithLead(proposalId);
  if (proposal === null) throw new AppError("NOT_FOUND", "That proposal doesn't exist.");
  const scope = proposal.lead;
  await assertActorCan(actor, "acquisition.proposal.send", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  if (proposal.status !== "APPROVED") {
    throw new AppError("CONFLICT", "Approve the proposal before sending it.");
  }

  const pdf = await renderProposalToBlob(proposal, scope.market, actor);
  const subject = `Proposal from FUTUREUNI`;
  const sent = await sendOneOffEmail(actor, {
    leadId: scope.id,
    contactId: input.contactId,
    subject,
    body: input.message,
    attachments: [{ fileKey: pdf.key, filename: pdf.filename }],
    humanConfirmedClaims: true,
  });

  const now = clockNow(clock);
  await withTransaction(async (tx) => {
    await repo.updateProposal(tx, proposalId, { status: "SENT", sentAt: now, sentMessageId: sent.messageId });
    if (scope.status === "REPLIED" || scope.status === "MEETING_BOOKED") {
      const result = await transitionLead(tx, { leadId: scope.id, to: "PROPOSAL_SENT", actor, reason: "proposal:sent", clock: { now: () => now } });
      await publishStatusChanged(tx, actor, result.event, { leadId: scope.id, serviceLine: scope.serviceLine, market: scope.market }, "proposal:sent");
    }
    await publishAfterCommit(tx, {
      name: "proposal.sent",
      actor,
      payload: { proposalId, leadId: scope.id, totalMinor: proposal.totalMinor, currency: proposal.currency },
    });
    await audit.record(tx, { actor, action: "acquisition.proposal.send", targetType: PROPOSAL_TARGET, targetId: proposalId, after: { messageId: sent.messageId } });
  });
  return { messageId: sent.messageId };
}

async function renderProposalToBlob(
  proposal: repo.ProposalWithLines & { lead: repo.LeadScope },
  market: repo.LeadScope["market"],
  actor: Actor,
): Promise<{ key: string; filename: string }> {
  const [company, meta] = await Promise.all([
    repo.getCompanySnapshot(proposal.lead.companyId),
    repo.getCompanyMeta(proposal.lead.companyId),
  ]);
  const context = await getProfileContext(proposal.lead.serviceLine, market, meta?.country ?? null);
  const sections = (proposal.sections ?? emptySections()) as ProposalSections;
  const ref = `PRP-${proposal.proposalGroupId.slice(-6).toUpperCase()}`;

  const { renderProposalPdf } = await import("./pdf/render");
  const buffer = await renderProposalPdf({
    ref,
    version: proposal.version,
    companyName: company?.name ?? "the client",
    preparedOn: formatDocDate(proposal.createdAt),
    validUntil: formatDocDate(proposal.validUntil),
    currency: proposal.currency,
    sections,
    lines: proposal.lineItems.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
      totalMinor: l.totalMinor,
    })),
    subtotalMinor: proposal.subtotalMinor,
    discountMinor: proposal.discountMinor,
    taxRateBps: proposal.taxRateBps,
    taxMinor: proposal.taxMinor,
    totalMinor: proposal.totalMinor,
    portfolio: context.portfolio,
  });

  const filename = `FUTUREUNI-${ref}.pdf`;
  const stored = await putFile({
    key: `acquisition/proposals/${proposal.id}/${ref}-v${String(proposal.version)}.pdf`,
    body: buffer,
    contentType: "application/pdf",
    access: "PRIVATE",
    purpose: "PROPOSAL_PDF",
    module: "acquisition",
    originalFilename: filename,
    ...(actor.type === "USER" ? { uploaderId: actor.userId } : {}),
  });
  await repo.setProposalPdf(proposal.id, stored.id);
  return { key: stored.key, filename };
}

function emptySections(): ProposalSections {
  const blank = "";
  return {
    understanding: blank,
    solution: blank,
    scope: blank,
    timeline: blank,
    investmentIntro: blank,
    whyFutureuni: blank,
    terms: blank,
    nextSteps: blank,
  };
}

export async function markProposalAccepted(actor: Actor, proposalId: string): Promise<void> {
  const proposal = await repo.getProposalWithLead(proposalId);
  if (proposal === null) throw new AppError("NOT_FOUND", "That proposal doesn't exist.");
  await assertActorCan(actor, "acquisition.proposal.send", {
    serviceLine: proposal.lead.serviceLine,
    ownerId: proposal.lead.ownerId,
  });
  await withTransaction(async (tx) => {
    await repo.updateProposal(tx, proposalId, { status: "ACCEPTED", acceptedAt: new Date() });
    await audit.record(tx, { actor, action: "acquisition.proposal.send", targetType: PROPOSAL_TARGET, targetId: proposalId, after: { status: "ACCEPTED" } });
  });
}

export interface DeclineProposalInput {
  reason: string;
  keepOpen?: boolean;
}

export async function markProposalDeclined(
  actor: Actor,
  proposalId: string,
  input: DeclineProposalInput,
): Promise<void> {
  if (input.reason.trim() === "") throw new AppError("VALIDATION_FAILED", "A decline needs a reason.");
  const proposal = await repo.getProposalWithLead(proposalId);
  if (proposal === null) throw new AppError("NOT_FOUND", "That proposal doesn't exist.");
  const scope = proposal.lead;
  await assertActorCan(actor, "acquisition.proposal.send", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });

  await withTransaction(async (tx) => {
    await repo.updateProposal(tx, proposalId, { status: "DECLINED", declinedAt: new Date(), declineReason: input.reason.trim() });
    if (input.keepOpen === true && scope.status === "PROPOSAL_SENT") {
      const result = await transitionLead(tx, { leadId: scope.id, to: "REPLIED", actor, reason: "proposal:declined" });
      await publishStatusChanged(tx, actor, result.event, { leadId: scope.id, serviceLine: scope.serviceLine, market: scope.market }, "proposal:declined");
    }
    await audit.record(tx, { actor, action: "acquisition.proposal.send", targetType: PROPOSAL_TARGET, targetId: proposalId, after: { status: "DECLINED" } });
  });
}

export interface ProposalVersionDiff {
  from: { version: number; totalMinor: number; currency: Currency };
  to: { version: number; totalMinor: number; currency: Currency };
  totalDeltaMinor: number;
  sameCurrency: boolean;
}

export async function diffProposalVersions(
  actor: Actor,
  proposalGroupId: string,
  fromVersion: number,
  toVersion: number,
): Promise<ProposalVersionDiff> {
  const versions = await repo.listProposalVersions(proposalGroupId);
  const from = versions.find((v) => v.version === fromVersion);
  const to = versions.find((v) => v.version === toVersion);
  if (from === undefined || to === undefined) throw new AppError("NOT_FOUND", "One of those proposal versions doesn't exist.");
  const scope = await repo.getLeadScope(from.leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That proposal's lead doesn't exist.");
  await assertActorCan(actor, "acquisition.proposal.create", { serviceLine: scope.serviceLine, ownerId: scope.ownerId });
  const sameCurrency = from.currency === to.currency;
  return {
    from: { version: from.version, totalMinor: from.totalMinor, currency: from.currency },
    to: { version: to.version, totalMinor: to.totalMinor, currency: to.currency },
    totalDeltaMinor: sameCurrency ? to.totalMinor - from.totalMinor : 0,
    sameCurrency,
  };
}

/** Daily job: expire sent proposals past their validity and set a follow-up next action. */
export async function expireProposals(now: Date): Promise<{ expired: number }> {
  const due = await repo.listExpiredProposals(now);
  let expired = 0;
  for (const proposal of due) {
    try {
      const scope = await repo.getLeadScope(proposal.leadId);
      await withTransaction(async (tx) => {
        await repo.updateProposal(tx, proposal.id, { status: "EXPIRED" });
        await repo.setNextAction(tx, proposal.leadId, new Date(now.getTime() + 24 * 60 * 60 * 1000), "Follow up — proposal expired.");
      });
      if (scope?.ownerId != null) {
        await notifySafe({
          userIds: [scope.ownerId],
          type: PIPELINE_NOTIFICATION_TYPES.proposalExpired,
          title: "A proposal expired",
          dedupeKey: `proposal.expired:${proposal.id}`,
        });
      }
      expired += 1;
    } catch (error) {
      pipelineLog.error("proposal expiry failed", { proposalId: proposal.id, error: error instanceof Error ? error.message : "error" });
    }
  }
  return { expired };
}
