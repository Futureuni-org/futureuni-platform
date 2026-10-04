"use server";

/**
 * Server actions for the lead-detail screen (also used by the pipeline board's dialogs). Each one
 * follows the saas-api handler shape: authenticate, parse with Zod, delegate to the owning service
 * (which authorises and audits), return a typed `ActionResult`. Nothing here computes money: prices
 * and totals come from the pricing service (INV-17) and deal values are passed through as integer
 * minor units (INV-11).
 */

import { z } from "zod";

import { CurrencySchema, IdSchema, LostReasonSchema, ServiceLineSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { ok, type ActionResult } from "@/lib/result";
import { actorOf, assertActorCan, requireUser } from "@/platform/auth";
import { getSignedUrl } from "@/platform/storage";
import {
  acceptReview,
  assignLead,
  disqualifyLead,
  generateBrief,
  overrideReview,
  rescoreLead,
} from "@/modules/acquisition/scoring";
import { setLeadingLead, splitGroup } from "@/modules/acquisition/crosssell";
import { dismissFinding, rerunAudit } from "@/modules/acquisition/audits";
import { sendOneOffEmail, snoozeLead } from "@/modules/acquisition/outreach";
import {
  addLeadNote,
  approveProposal,
  assignHandoff,
  createMeeting,
  createProposal,
  diffProposalVersions,
  effectiveDiscountBps,
  exportHandoff,
  markLost,
  markProposalAccepted,
  markProposalDeclined,
  markWon,
  nurtureLead,
  priceProposal,
  recordMeetingOutcome,
  reengageLead,
  regeneratePrecallBrief,
  reviseProposal,
  sendProposal,
  setNextAction,
} from "@/modules/acquisition/pipeline";
import { getProfileContext } from "@/modules/acquisition/pipeline/profile-context";
import {
  getDiscountApprovalThresholdBps,
  getTaxSettings,
} from "@/modules/acquisition/pipeline/settings";

import { failed, sendResultFor } from "./action-result";
import type { QuotePreview } from "./detail-types";
import { canReauditIn, canRescoreIn } from "./lead-actions";
import {
  getHandoffServices,
  getLeadScope,
  getProposalLeadId,
  isLeadContact,
  isOnLineTeam,
  leadResource,
  setPrimaryContact,
  type LeadScope,
} from "./lead-detail.repo";
import { getLeadPricingScope } from "./lead-pipeline.repo";
import type { SendResult } from "./send-outcome";

type Done = ActionResult<{ ok: true }>;
const DONE = { ok: true } as const;

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

/** Parse or throw a VALIDATION_FAILED AppError (caught by the action's try/catch). */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw fail(parsed.error.issues);
  return parsed.data;
}

const IsoDate = z.iso.datetime();
const Text = (max: number) => z.string().trim().min(1).max(max);
const OptionalText = (max: number) => z.string().trim().max(max).nullish();

async function requireLeadScope(leadId: string): Promise<LeadScope> {
  const scope = await getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "Lead not found.");
  return scope;
}

/** Refuses a contact that isn't a live contact of the lead's own company. */
async function assertLeadContact(leadId: string, contactId: string): Promise<void> {
  if (!(await isLeadContact(leadId, contactId))) {
    throw new AppError("VALIDATION_FAILED", "That contact doesn't belong to this lead's company.");
  }
}

// ---- Lead-level ------------------------------------------------------------------------------

export async function rescoreAction(leadId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    // The scoring service returns quietly for a lead it won't score (in review, approved, before
    // the audit). Refuse here instead, so the screen never reports a re-score that didn't happen.
    const scope = await requireLeadScope(id);
    await assertActorCan(actor, "acquisition.lead.rescore", leadResource(scope));
    if (!canRescoreIn(scope.status)) {
      throw new AppError("CONFLICT", "This lead can't be re-scored in its current status.");
    }
    const result = await rescoreLead(actor, id);
    return ok({ status: result.status });
  } catch (error) {
    return failed(error);
  }
}

export async function reauditAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const scope = await requireLeadScope(id);
    await assertActorCan(actor, "acquisition.lead.reaudit", leadResource(scope));
    if (!canReauditIn(scope.status)) {
      throw new AppError("CONFLICT", "This lead can't be re-audited in its current status.");
    }
    const result = await rerunAudit(actor, id);
    // The status can change between the check above and the run; the run then does nothing.
    if (result.status === "NOT_APPLICABLE") {
      throw new AppError("CONFLICT", "This lead can't be re-audited in its current status.");
    }
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function disqualifyAction(leadId: string, reason: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await disqualifyLead(actor, parse(IdSchema, leadId), parse(Text(200), reason));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function assignOwnerAction(leadId: string, ownerId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await assignLead(actor, parse(IdSchema, leadId), parse(IdSchema, ownerId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function snoozeAction(leadId: string, until: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await snoozeLead(actor, parse(IdSchema, leadId), new Date(parse(IsoDate, until)));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function nurtureAction(
  leadId: string,
  until: string,
  note: string | null,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await nurtureLead(actor, parse(IdSchema, leadId), {
      until: new Date(parse(IsoDate, until)),
      note: parse(OptionalText(500), note) ?? null,
    });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function reengageAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await reengageLead(actor, parse(IdSchema, leadId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function setNextActionAction(
  leadId: string,
  at: string | null,
  note: string | null,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await setNextAction(actor, parse(IdSchema, leadId), {
      at: at === null ? null : new Date(parse(IsoDate, at)),
      note: parse(OptionalText(300), note) ?? null,
    });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function setPrimaryContactAction(leadId: string, contactId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const scope = await requireLeadScope(id);
    await assertActorCan(actor, "acquisition.lead.update", leadResource(scope));
    await setPrimaryContact(id, parse(IdSchema, contactId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function addNoteAction(
  leadId: string,
  body: string,
  mentions: string[],
): Promise<ActionResult<{ noteId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const result = await addLeadNote(actor, parse(IdSchema, leadId), {
      body: parse(Text(4000), body),
      mentions: parse(z.array(IdSchema).max(20), mentions),
    });
    return ok(result);
  } catch (error) {
    return failed(error);
  }
}

/**
 * Regenerates the lead's brief. `generateBrief` has no permission check of its own (it is also
 * called by the scoring job), so this action authorises `acquisition.lead.update` on the lead
 * before it spends an AI call and overwrites the brief.
 */
export async function regenerateBriefAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const scope = await requireLeadScope(id);
    await assertActorCan(actor, "acquisition.lead.update", leadResource(scope));
    await generateBrief(id, { actor });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Score review and cross-sell --------------------------------------------------------------

export async function acceptReviewAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await acceptReview(actor, parse(IdSchema, leadId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function overrideReviewAction(
  leadId: string,
  decision: "QUALIFY" | "DISQUALIFY",
  note: string,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await overrideReview(
      actor,
      parse(IdSchema, leadId),
      parse(z.enum(["QUALIFY", "DISQUALIFY"]), decision),
      parse(Text(500), note),
    );
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function setLeadingLeadAction(groupId: string, leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await setLeadingLead(actor, parse(IdSchema, groupId), parse(IdSchema, leadId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function splitGroupAction(groupId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await splitGroup(actor, parse(IdSchema, groupId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Evidence --------------------------------------------------------------------------------

export async function dismissFindingAction(findingId: string, reason: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await dismissFinding(actor, parse(IdSchema, findingId), parse(Text(300), reason));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Conversation ----------------------------------------------------------------------------

const OneOffSchema = z.object({
  leadId: IdSchema,
  contactId: IdSchema,
  subject: Text(200),
  body: Text(20000),
  humanConfirmedClaims: z.literal(true, { error: "Confirm the claims before sending." }),
});

export async function sendOneOffAction(
  input: z.input<typeof OneOffSchema>,
): Promise<ActionResult<SendResult>> {
  try {
    const actor = actorOf(await requireUser());
    const email = parse(OneOffSchema, input);
    // The service authorises the lead but takes any contact id. Without this, a lead the person
    // may email could be used to send to a contact of a company in a line they can't see.
    const scope = await requireLeadScope(email.leadId);
    await assertActorCan(actor, "acquisition.message.sendOneOff", leadResource(scope));
    // A suppressed lead is never messaged. The send path would block it too; refusing here means
    // no message row is written for an email that could not go out.
    if (scope.status === "SUPPRESSED") {
      throw new AppError(
        "SUPPRESSED",
        "This lead is suppressed, so it can't be messaged. An admin can remove the suppression.",
      );
    }
    await assertLeadContact(email.leadId, email.contactId);
    const { messageId } = await sendOneOffEmail(actor, email);
    return ok(await sendResultFor(messageId));
  } catch (error) {
    return failed(error);
  }
}

// ---- Meetings --------------------------------------------------------------------------------

const MeetingSchema = z
  .object({
    startsAt: IsoDate,
    endsAt: IsoDate,
    location: OptionalText(300),
    notes: OptionalText(2000),
  })
  .refine((m) => new Date(m.endsAt).getTime() > new Date(m.startsAt).getTime(), {
    error: "The meeting must end after it starts.",
    path: ["endsAt"],
  });

export async function createMeetingAction(
  leadId: string,
  input: z.input<typeof MeetingSchema>,
): Promise<ActionResult<{ meetingId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const m = parse(MeetingSchema, input);
    return ok(
      await createMeeting(actor, parse(IdSchema, leadId), {
        startsAt: new Date(m.startsAt),
        endsAt: new Date(m.endsAt),
        location: m.location ?? null,
        notes: m.notes ?? null,
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

const OutcomeSchema = z.object({
  outcome: z.enum(["HELD", "NO_SHOW", "RESCHEDULED"]),
  notes: OptionalText(4000),
  transcript: z.string().trim().max(60000).nullish(),
});

export async function recordOutcomeAction(
  meetingId: string,
  input: z.input<typeof OutcomeSchema>,
): Promise<ActionResult<{ summarised: boolean }>> {
  try {
    const actor = actorOf(await requireUser());
    const o = parse(OutcomeSchema, input);
    return ok(
      await recordMeetingOutcome(actor, parse(IdSchema, meetingId), {
        outcome: o.outcome,
        notes: o.notes ?? null,
        transcript: o.transcript ?? null,
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function regeneratePrecallAction(
  meetingId: string,
): Promise<ActionResult<{ generated: boolean }>> {
  try {
    const actor = actorOf(await requireUser());
    return ok(await regeneratePrecallBrief(actor, parse(IdSchema, meetingId)));
  } catch (error) {
    return failed(error);
  }
}

// ---- Proposals -------------------------------------------------------------------------------

const Minor = z.int().nonnegative();
const ProposalSchema = z.object({
  packages: z
    .array(
      z.object({
        packageId: z.string().min(1).max(64),
        quantity: z.int().min(1).max(100).optional(),
        unitPriceMinor: Minor.optional(),
      }),
    )
    .max(10),
  lineItems: z
    .array(
      z.object({
        description: Text(300),
        quantity: z.int().min(1).max(1000),
        unitPriceMinor: Minor,
      }),
    )
    .max(30)
    .optional(),
  discount: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("NONE") }),
      z.object({ type: z.literal("PERCENT"), valueBps: z.int().min(0).max(10000) }),
      z.object({ type: z.literal("AMOUNT"), valueMinor: Minor }),
    ])
    .optional(),
  validUntil: IsoDate.optional(),
  notes: OptionalText(2000),
  timelineSummary: z.string().trim().max(1000).optional(),
});
export type ProposalFormInput = z.input<typeof ProposalSchema>;

function toProposalInput(input: ProposalFormInput) {
  const p = parse(ProposalSchema, input);
  return {
    packages: p.packages.map((pkg) => ({
      packageId: pkg.packageId,
      ...(pkg.quantity === undefined ? {} : { quantity: pkg.quantity }),
      ...(pkg.unitPriceMinor === undefined ? {} : { unitPriceMinor: pkg.unitPriceMinor }),
    })),
    ...(p.lineItems === undefined ? {} : { lineItems: p.lineItems }),
    ...(p.discount === undefined ? {} : { discount: p.discount }),
    ...(p.validUntil === undefined ? {} : { validUntil: new Date(p.validUntil) }),
    notes: p.notes ?? null,
    ...(p.timelineSummary === undefined ? {} : { timelineSummary: p.timelineSummary }),
  };
}

const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

/**
 * Prices a quote on the server for the live preview (INV-17: the client never does money maths).
 * It runs the same deterministic `priceProposal` the proposal services use, with the lead's market,
 * its profile packages and the platform tax setting, and reports whether manager approval would be
 * needed and why. The binding decision is still made by `createProposal` when the proposal is saved.
 */
export async function priceQuoteAction(
  leadId: string,
  input: ProposalFormInput,
): Promise<ActionResult<QuotePreview>> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const form = parse(ProposalSchema, input);

    const scope = await getLeadPricingScope(id);
    if (scope === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.proposal.create", {
      serviceLine: scope.serviceLine,
      ...(scope.ownerId === null ? {} : { ownerId: scope.ownerId }),
    });

    const [context, thresholdBps, tax] = await Promise.all([
      getProfileContext(scope.serviceLine, scope.market, scope.country),
      getDiscountApprovalThresholdBps(),
      getTaxSettings(),
    ]);

    const outOfRange: string[] = [];
    const packages = form.packages.map((selected) => {
      const pkg = context.packages.find((p) => p.id === selected.packageId);
      if (pkg === undefined) {
        throw new AppError("VALIDATION_FAILED", "That package isn't in this line's pricing.");
      }
      const unitPriceMinor = selected.unitPriceMinor ?? pkg.typicalMinor;
      if (unitPriceMinor < pkg.minMinor || unitPriceMinor > pkg.maxMinor) outOfRange.push(pkg.name);
      return {
        packageId: pkg.id,
        name: pkg.name,
        quantity: selected.quantity ?? 1,
        unitPriceMinor,
      };
    });

    const priced = priceProposal({
      market: scope.market,
      currency: context.currency,
      packages,
      lineItems: form.lineItems ?? [],
      discount: form.discount ?? { type: "NONE" },
      tax,
    });

    const discountBps = effectiveDiscountBps(priced);
    const approvalReasons: string[] = [];
    if (discountBps > thresholdBps) {
      approvalReasons.push(
        `The discount is ${PERCENT.format(discountBps / 10000)}, above the ${PERCENT.format(thresholdBps / 10000)} limit.`,
      );
    }
    if (outOfRange.length > 0) {
      approvalReasons.push(`Priced outside the profile range: ${outOfRange.join(", ")}.`);
    }

    return ok({
      currency: priced.currency,
      lines: priced.lines.map((line) => ({
        packageId: line.packageId,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        totalMinor: line.totalMinor,
      })),
      subtotalMinor: priced.subtotalMinor,
      discountMinor: priced.discountMinor,
      taxMinor: priced.taxMinor,
      totalMinor: priced.totalMinor,
      requiresApproval: approvalReasons.length > 0,
      approvalReasons,
    });
  } catch (error) {
    return failed(error);
  }
}

export interface ProposalActionResult {
  proposalId: string;
  version: number;
  requiresApproval: boolean;
}

export async function createProposalAction(
  leadId: string,
  input: ProposalFormInput,
): Promise<ActionResult<ProposalActionResult>> {
  try {
    const actor = actorOf(await requireUser());
    const r = await createProposal(actor, parse(IdSchema, leadId), toProposalInput(input));
    return ok({
      proposalId: r.proposalId,
      version: r.version,
      requiresApproval: r.requiresApproval,
    });
  } catch (error) {
    return failed(error);
  }
}

export async function reviseProposalAction(
  proposalId: string,
  input: ProposalFormInput,
): Promise<ActionResult<ProposalActionResult>> {
  try {
    const actor = actorOf(await requireUser());
    const r = await reviseProposal(actor, parse(IdSchema, proposalId), toProposalInput(input));
    return ok({
      proposalId: r.proposalId,
      version: r.version,
      requiresApproval: r.requiresApproval,
    });
  } catch (error) {
    return failed(error);
  }
}

export async function approveProposalAction(proposalId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await approveProposal(actor, parse(IdSchema, proposalId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

const SendProposalSchema = z.object({
  proposalId: IdSchema,
  contactId: IdSchema,
  message: Text(5000),
  humanConfirmed: z.literal(true, { error: "Confirm the proposal before sending." }),
});

export async function sendProposalAction(
  proposalId: string,
  contactId: string,
  message: string,
  humanConfirmed: boolean,
): Promise<ActionResult<SendResult>> {
  try {
    const actor = actorOf(await requireUser());
    const send = parse(SendProposalSchema, { proposalId, contactId, message, humanConfirmed });
    // The recipient must be a contact of the company the proposal was written for.
    const leadId = await getProposalLeadId(send.proposalId);
    if (leadId === null) throw new AppError("NOT_FOUND", "Proposal not found.");
    const scope = await requireLeadScope(leadId);
    await assertActorCan(actor, "acquisition.proposal.send", leadResource(scope));
    await assertLeadContact(leadId, send.contactId);
    const { messageId } = await sendProposal(actor, send.proposalId, {
      contactId: send.contactId,
      message: send.message,
    });
    return ok(await sendResultFor(messageId));
  } catch (error) {
    return failed(error);
  }
}

/** The change in total between two versions of a proposal, computed by the proposals service. */
export async function diffProposalAction(
  proposalGroupId: string,
  fromVersion: number,
  toVersion: number,
): Promise<
  ActionResult<{
    from: { version: number; totalMinor: number; currency: string };
    to: { version: number; totalMinor: number; currency: string };
    totalDeltaMinor: number;
    sameCurrency: boolean;
  }>
> {
  try {
    const actor = actorOf(await requireUser());
    const version = z.int().min(1).max(999);
    return ok(
      await diffProposalVersions(
        actor,
        parse(IdSchema, proposalGroupId),
        parse(version, fromVersion),
        parse(version, toVersion),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function acceptProposalAction(proposalId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await markProposalAccepted(actor, parse(IdSchema, proposalId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function declineProposalAction(
  proposalId: string,
  reason: string,
  keepOpen: boolean,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await markProposalDeclined(actor, parse(IdSchema, proposalId), {
      reason: parse(Text(300), reason),
      keepOpen: parse(z.boolean(), keepOpen),
    });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Won / lost / handoff --------------------------------------------------------------------

const WonSchema = z.object({
  valueMinor: Minor,
  currency: CurrencySchema,
  services: z.array(ServiceLineSchema).min(1).max(4),
  proposalId: IdSchema.nullish(),
  startDate: IsoDate.nullish(),
  notes: OptionalText(2000),
});
export type WonFormInput = z.input<typeof WonSchema>;

export async function markWonAction(
  leadId: string,
  input: WonFormInput,
): Promise<ActionResult<{ dealId: string; handoffId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const w = parse(WonSchema, input);
    // A deal can only be tied to one of this lead's own proposals. The service stores whatever id
    // it is given, which would link the deal (and its handoff) to another company's proposal.
    if (w.proposalId != null && (await getProposalLeadId(w.proposalId)) !== id) {
      throw new AppError("VALIDATION_FAILED", "That proposal doesn't belong to this lead.");
    }
    return ok(
      await markWon(actor, id, {
        valueMinor: w.valueMinor,
        currency: w.currency,
        services: w.services,
        proposalId: w.proposalId ?? null,
        startDate: w.startDate == null ? null : new Date(w.startDate),
        notes: w.notes ?? null,
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

const LostSchema = z.object({
  reason: LostReasonSchema,
  competitor: OptionalText(120),
  note: OptionalText(1000),
  reengageAt: IsoDate.nullish(),
});
export type LostFormInput = z.input<typeof LostSchema>;

export async function markLostAction(
  leadId: string,
  input: LostFormInput,
): Promise<ActionResult<{ dealId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const l = parse(LostSchema, input);
    return ok(
      await markLost(actor, parse(IdSchema, leadId), {
        reason: l.reason,
        competitor: l.competitor ?? null,
        note: l.note ?? null,
        reengageAt: l.reengageAt == null ? null : new Date(l.reengageAt),
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function assignHandoffAction(
  handoffId: string,
  serviceLine: string,
  userId: string,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, handoffId);
    const line = parse(ServiceLineSchema, serviceLine);
    const delivererId = parse(IdSchema, userId);
    await assertActorCan(actor, "acquisition.handoff.assign");
    // The service accepts any line and any user id. A delivery owner must be for a service the
    // deal actually sold, and must be an active member of that line's team.
    const services = await getHandoffServices(id);
    if (services === null) throw new AppError("NOT_FOUND", "Handoff not found.");
    if (!services.includes(line)) {
      throw new AppError("VALIDATION_FAILED", "That service isn't part of this deal.");
    }
    if (!(await isOnLineTeam(delivererId, line))) {
      throw new AppError("VALIDATION_FAILED", "That teammate isn't on this service line.");
    }
    await assignHandoff(actor, id, { serviceLine: line, userId: delivererId });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

/** Builds the handoff export and returns a short-lived signed URL to download it. */
export async function exportHandoffAction(
  handoffId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const { fileKey } = await exportHandoff(actor, parse(IdSchema, handoffId));
    return ok({ url: await getSignedUrl(fileKey, 300) });
  } catch (error) {
    return failed(error);
  }
}
