import "server-only";

import type {
  Actor,
  ActorType,
  Clock,
  JsonValue,
  LeadStatus,
  NurtureReason,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";
import {
  isUniqueViolation,
  toJsonInput,
  withSavepoint,
  type Lead,
  type LeadEvent,
  type Prisma,
  type Tx,
} from "@/platform/db";

import { findLead, insertLeadEvent, updateLeadFromStatus } from "./lead.repo";

/**
 * The lead lifecycle (docs/specs/module-acquisition.md §5.2, the only source; INV-15). Every
 * status change goes through transitionLead, which writes its LeadEvent in the same transaction
 * (INV-1). Anything not in this table fails with INVALID_TRANSITION.
 */
export const LEAD_TRANSITIONS: Readonly<Record<LeadStatus, readonly LeadStatus[]>> = {
  NEW: ["ENRICHING", "DISQUALIFIED", "SUPPRESSED"],
  ENRICHING: ["ENRICHED", "DISQUALIFIED", "SUPPRESSED"],
  ENRICHED: ["AUDITING", "DISQUALIFIED", "SUPPRESSED"],
  AUDITING: ["AUDITED", "ENRICHED", "DISQUALIFIED", "SUPPRESSED"],
  AUDITED: ["SCORED", "DISQUALIFIED", "NURTURE", "SUPPRESSED"],
  SCORED: ["NURTURE", "DISQUALIFIED", "IN_REVIEW", "SUPPRESSED"],
  IN_REVIEW: ["APPROVED", "SCORED", "DISQUALIFIED", "SUPPRESSED"],
  APPROVED: ["CONTACTED", "IN_REVIEW", "DISQUALIFIED", "SUPPRESSED"],
  CONTACTED: ["REPLIED", "NURTURE", "MEETING_BOOKED", "LOST", "SUPPRESSED"],
  REPLIED: ["NURTURE", "MEETING_BOOKED", "PROPOSAL_SENT", "LOST", "SUPPRESSED"],
  MEETING_BOOKED: ["REPLIED", "PROPOSAL_SENT", "WON", "LOST", "NURTURE", "SUPPRESSED"],
  PROPOSAL_SENT: ["WON", "REPLIED", "LOST", "NURTURE", "SUPPRESSED"],
  // NURTURE → SCORED only for a CAPACITY or COMPLIANCE hold (see canTransition).
  NURTURE: ["SCORED", "REPLIED", "LOST", "DISQUALIFIED", "SUPPRESSED"],
  LOST: ["NURTURE", "SUPPRESSED"],
  WON: [],
  DISQUALIFIED: ["SUPPRESSED"],
  SUPPRESSED: [],
};

/** WON and SUPPRESSED end the lifecycle; DISQUALIFIED ends it except for SUPPRESSED. */
export const LEAD_TERMINAL_STATUSES: readonly LeadStatus[] = ["WON", "SUPPRESSED"];
/** Statuses that set closedAt and don't count as open (the one-open-lead index). */
export const LEAD_CLOSED_STATUSES: readonly LeadStatus[] = [
  "WON",
  "LOST",
  "DISQUALIFIED",
  "SUPPRESSED",
];
export const LEAD_PRE_CONTACT_STATUSES: readonly LeadStatus[] = [
  "NEW",
  "ENRICHING",
  "ENRICHED",
  "AUDITING",
  "AUDITED",
  "SCORED",
  "IN_REVIEW",
  "APPROVED",
];
/** Active (post-contact) statuses. */
export const LEAD_ACTIVE_STATUSES: readonly LeadStatus[] = [
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "NURTURE",
];

/** Nurture holds that a re-score may release back to SCORED. */
const RELEASABLE_NURTURE: readonly NurtureReason[] = ["CAPACITY", "COMPLIANCE"];

/**
 * The nurture reasons each status may park a lead with (§5.2 table): a capacity or compliance
 * hold before contact, a low score at scoring, NOT_NOW or MANUAL after contact, REENGAGE from LOST.
 */
export const NURTURE_REASONS_FROM: Readonly<Partial<Record<LeadStatus, readonly NurtureReason[]>>> =
  {
    AUDITED: ["CAPACITY", "LOW_SCORE", "COMPLIANCE"],
    SCORED: ["CAPACITY", "COMPLIANCE"],
    CONTACTED: ["NOT_NOW", "MANUAL"],
    REPLIED: ["NOT_NOW", "MANUAL"],
    MEETING_BOOKED: ["MANUAL"],
    PROPOSAL_SENT: ["MANUAL"],
    LOST: ["REENGAGE"],
  };

/** An open lead: not WON, LOST, DISQUALIFIED or SUPPRESSED. */
export function isOpenLeadStatus(status: LeadStatus): boolean {
  return !LEAD_CLOSED_STATUSES.includes(status);
}

/**
 * Whether the lifecycle allows `from` → `to`. Pass the lead's nurtureReason (and, when known,
 * firstContactedAt): NURTURE → SCORED is allowed only for a CAPACITY or COMPLIANCE hold of a lead
 * that was never contacted, because a score change never moves a contacted lead backwards (§5.2
 * rules). Re-entering the same status isn't a transition, so it returns false.
 */
export function canTransition(
  from: LeadStatus,
  to: LeadStatus,
  lead: { nurtureReason?: NurtureReason | null; firstContactedAt?: Date | null } = {},
): boolean {
  if (!LEAD_TRANSITIONS[from].includes(to)) return false;
  if (from === "NURTURE" && to === "SCORED") {
    if (lead.firstContactedAt != null) return false;
    return lead.nurtureReason != null && RELEASABLE_NURTURE.includes(lead.nurtureReason);
  }
  return true;
}

/** The LeadEvent actor columns: a user by id, or a system job by name (actorLabel). */
export function leadEventActor(actor: Actor): {
  actorType: ActorType;
  actorId: string | null;
  actorLabel: string | null;
} {
  return actor.type === "USER"
    ? { actorType: "USER", actorId: actor.userId, actorLabel: null }
    : { actorType: "SYSTEM", actorId: null, actorLabel: actor.job };
}

export interface TransitionLeadInput {
  leadId: string;
  to: LeadStatus;
  actor: Actor;
  /** Shown in the lead's history. Required for DISQUALIFIED, where it's the disqualifyReason (e.g. "low_score", "disqualifier:<id>"). */
  reason?: string;
  /** Step summary stored on the LeadEvent (no personal data). */
  meta?: Record<string, JsonValue>;
  /** Required when moving to NURTURE. */
  nurtureReason?: NurtureReason;
  clock?: Clock;
}

export interface TransitionLeadResult {
  lead: Lead;
  /** The STATUS_CHANGE row; null when the lead was already in `to` (not a transition). */
  event: LeadEvent | null;
}

const systemClock: Clock = { now: () => new Date() };

function isRecordNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

/**
 * Moves a lead to `to` and writes its STATUS_CHANGE LeadEvent in the same transaction (INV-1,
 * INV-15). It emits nothing: the caller publishes `lead.statusChanged` with publishAfterCommit,
 * using the returned event's id.
 *
 * - NOT_FOUND: no such lead.
 * - INVALID_TRANSITION: not in LEAD_TRANSITIONS (nothing is written).
 * - VALIDATION_FAILED: NURTURE without a nurtureReason, or DISQUALIFIED without a reason.
 * - CONFLICT: another request changed the lead's status first (optimistic concurrency).
 *
 * Side fields: closedAt is set when the lead closes (and cleared on LOST → NURTURE),
 * firstContactedAt on the first CONTACTED, nurtureReason while in NURTURE, disqualifyReason on
 * DISQUALIFIED, and lastActivityAt every time.
 */
export async function transitionLead(
  tx: Tx,
  input: TransitionLeadInput,
): Promise<TransitionLeadResult> {
  const lead = await findLead(tx, input.leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  const from = lead.status;
  const { to } = input;
  if (from === to) return { lead, event: null };
  if (!canTransition(from, to, lead)) {
    throw new AppError("INVALID_TRANSITION", `A lead can't move from ${from} to ${to}.`, {
      details: { from, to },
    });
  }

  const reason = input.reason?.trim() ?? "";
  if (to === "NURTURE" && input.nurtureReason === undefined) {
    throw new AppError("VALIDATION_FAILED", "Moving a lead to nurture needs a nurture reason.");
  }
  if (to === "NURTURE" && input.nurtureReason !== undefined) {
    const allowed = NURTURE_REASONS_FROM[from] ?? [];
    if (!allowed.includes(input.nurtureReason)) {
      throw new AppError(
        "VALIDATION_FAILED",
        `A ${from} lead can't be nurtured for ${input.nurtureReason}.`,
        { details: { from, nurtureReason: input.nurtureReason } },
      );
    }
  }
  if (to === "DISQUALIFIED" && reason === "") {
    throw new AppError("VALIDATION_FAILED", "Disqualifying a lead needs a reason.");
  }

  const now = (input.clock ?? systemClock).now();
  const data: Prisma.LeadUncheckedUpdateInput = { status: to, lastActivityAt: now };
  if (LEAD_CLOSED_STATUSES.includes(to)) {
    if (lead.closedAt === null) data.closedAt = now;
  } else if (lead.closedAt !== null) {
    data.closedAt = null;
  }
  if (to === "NURTURE") data.nurtureReason = input.nurtureReason ?? null;
  else if (from === "NURTURE") data.nurtureReason = null;
  if (to === "DISQUALIFIED") data.disqualifyReason = reason;
  if (to === "CONTACTED" && lead.firstContactedAt === null) data.firstContactedAt = now;

  let updated: Lead;
  try {
    // A savepoint, so a clash on the one-open-lead index (LOST → NURTURE while another open lead
    // exists, §5.2) leaves the caller's transaction usable.
    updated = await withSavepoint(tx, () => updateLeadFromStatus(tx, lead.id, from, data));
  } catch (error) {
    if (isUniqueViolation(error, "acq_leads_one_open")) {
      throw new AppError(
        "CONFLICT",
        "Another open lead already exists for this company, line and market.",
        { details: { from, to } },
      );
    }
    if (isRecordNotFound(error)) {
      throw new AppError(
        "CONFLICT",
        "This lead changed while you were working on it. Refresh and try again.",
        {
          details: { from, to },
        },
      );
    }
    throw error;
  }

  const event = await insertLeadEvent(tx, {
    leadId: lead.id,
    kind: "STATUS_CHANGE",
    fromStatus: from,
    toStatus: to,
    ...leadEventActor(input.actor),
    reason: reason === "" ? null : reason,
    ...(input.meta === undefined ? {} : { meta: toJsonInput(input.meta) }),
  });
  return { lead: updated, event };
}

/**
 * Writes the "— → NEW" STATUS_CHANGE event for a lead that was just created (the first row of
 * every lead's history, INV-1). Call it in the same transaction as the create.
 */
export async function recordLeadCreation(
  tx: Tx,
  input: { leadId: string; actor: Actor; reason?: string; meta?: Record<string, JsonValue> },
): Promise<LeadEvent> {
  const lead = await findLead(tx, input.leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  if (lead.status !== "NEW") {
    throw new AppError("INVALID_TRANSITION", "Only a new lead records its creation.", {
      details: { status: lead.status },
    });
  }
  return insertLeadEvent(tx, {
    leadId: lead.id,
    kind: "STATUS_CHANGE",
    fromStatus: null,
    toStatus: "NEW",
    ...leadEventActor(input.actor),
    reason: input.reason?.trim() ?? null,
    ...(input.meta === undefined ? {} : { meta: toJsonInput(input.meta) }),
  });
}
