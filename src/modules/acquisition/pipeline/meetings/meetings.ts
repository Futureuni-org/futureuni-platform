/**
 * Meetings service (module spec §3.13 "Meetings"). Booking links, the calendar webhook handler,
 * manual meetings, reminders and the pre-call brief, plus the meeting outcome and summary.
 *
 * Times are stored in UTC (INV-12). Time-dependent work takes an injectable `now()` (B4). The
 * webhook handler runs as the SYSTEM actor (the route already verified the signature and deduped).
 */

import "server-only";

import type { MeetingSummary, PrecallBrief } from "@/contracts/acquisition-records";
import type { Actor, Clock } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { withTransaction, type Tx } from "@/platform/db";
import { runTask } from "@/platform/ai";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { publishAfterCommit } from "@/platform/events";

import { canTransition, transitionLead } from "@/modules/acquisition/core";

import { stopEnrollments } from "../_seams";
import * as repo from "../pipeline.repo";
import { getProfileContext } from "../profile-context";
import { notifySafe, pipelineLog, publishStatusChanged } from "../shared";
import { PIPELINE_NOTIFICATION_TYPES } from "../notifications";
import { getReminderOffsetsMinutes, getOwnerBookingUrl, getPrecallLeadMinutes } from "../settings";
import {
  MeetingSummaryInputSchema,
  PrecallBriefInputSchema,
  meetingSummaryTask,
  precallBriefTask,
} from "../tasks";
import { buildBookingUrl, signLeadRef } from "./booking-link";
import type { NormalizedBooking } from "./calendar/types";

const WEBHOOK_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.pipeline.calendar-webhook" };
const MEETING_TARGET = "acquisition.meeting";

function clockNow(clock?: Clock): Date {
  return (clock ?? { now: () => new Date() }).now();
}

function defaultTimezone(market: string, companyTimezone: string | null): string {
  if (companyTimezone !== null && companyTimezone !== "") return companyTimezone;
  return market === "NIGERIA" ? "Africa/Lagos" : "UTC";
}

// ---------------------------------------------------------------------------
// SEAM-BOOKING-LINK (provided to Phases 12 and 13)
// ---------------------------------------------------------------------------

/** The owner's booking URL with a signed lead reference embedded (ADR-021). */
export async function getBookingLink(leadId: string, ownerId?: string): Promise<string> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  const owner = ownerId ?? scope.ownerId;
  const baseUrl = await getOwnerBookingUrl(owner);
  if (baseUrl === "") {
    throw new AppError("PROVIDER_ERROR", "No booking URL is configured for this owner.");
  }
  return buildBookingUrl(baseUrl, signLeadRef(leadId));
}

// ---------------------------------------------------------------------------
// Manual meetings
// ---------------------------------------------------------------------------

export interface CreateMeetingInput {
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  notes?: string | null;
}

export async function createMeeting(
  actor: Actor,
  leadId: string,
  input: CreateMeetingInput,
  clock?: Clock,
): Promise<{ meetingId: string }> {
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  await assertActorCan(actor, "acquisition.meeting.manage", {
    serviceLine: scope.serviceLine,
    ownerId: scope.ownerId,
  });
  if (input.endsAt <= input.startsAt) {
    throw new AppError("VALIDATION_FAILED", "A meeting must end after it starts.");
  }
  const meta = await repo.getCompanyMeta(scope.companyId);
  const timezone = defaultTimezone(scope.market, meta?.timezone ?? null);

  return withTransaction(async (tx) => {
    const meeting = await repo.createMeeting(tx, {
      leadId,
      companyId: scope.companyId,
      contactId: scope.primaryContactId,
      ownerId: scope.ownerId,
      source: "MANUAL",
      externalId: null,
      status: "SCHEDULED",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone,
      location: input.location ?? null,
      videoUrl: null,
      attendeeEmail: null,
      attendeeName: null,
      notes: input.notes ?? null,
    });
    await transitionToMeetingBooked(tx, actor, scope, "meeting:manual", clockNow(clock));
    await audit.record(tx, {
      actor,
      action: "acquisition.meeting.manage",
      targetType: MEETING_TARGET,
      targetId: meeting.id,
      after: { source: "MANUAL", startsAt: input.startsAt.toISOString() },
    });
    await publishMeetingBooked(tx, actor, meeting.id, leadId, input.startsAt, scope.ownerId);
    return { meetingId: meeting.id };
  });
}

// ---------------------------------------------------------------------------
// Calendar webhook
// ---------------------------------------------------------------------------

export type WebhookOutcome =
  | { action: "created"; meetingId: string; leadId: string | null }
  | { action: "rescheduled" | "cancelled"; meetingId: string; leadId: string | null }
  | { action: "unmatched"; meetingId: string; leadId: null }
  | { action: "ignored"; meetingId: null; leadId: null };

/** Handles a verified, deduped calendar booking. Runs as the SYSTEM actor. */
export async function handleCalendarBooking(
  booking: NormalizedBooking,
  resolveLeadRef: (ref: string) => string | null,
  clock?: Clock,
): Promise<WebhookOutcome> {
  const now = clockNow(clock);
  const leadId = await resolveBookingLead(booking, resolveLeadRef);

  if (booking.kind === "CREATED") return handleBookingCreated(booking, leadId, now);
  if (booking.kind === "RESCHEDULED") return handleBookingRescheduled(booking, now);
  return handleBookingCancelled(booking, now);
}

async function resolveBookingLead(
  booking: NormalizedBooking,
  resolveLeadRef: (ref: string) => string | null,
): Promise<string | null> {
  if (booking.leadRef !== null) {
    const fromRef = resolveLeadRef(booking.leadRef);
    if (fromRef !== null) return fromRef;
  }
  if (booking.attendeeEmail !== null) {
    const match = await repo.findContactByEmail(booking.attendeeEmail);
    if (match?.leadId != null) return match.leadId;
  }
  return null;
}

async function handleBookingCreated(
  booking: NormalizedBooking,
  leadId: string | null,
  now: Date,
): Promise<WebhookOutcome> {
  if (leadId === null) {
    const match = booking.attendeeEmail === null ? null : await repo.findContactByEmail(booking.attendeeEmail);
    const meeting = await withTransaction((tx) =>
      repo.createMeeting(tx, {
        leadId: null,
        companyId: match?.companyId ?? null,
        contactId: match?.contactId ?? null,
        ownerId: null,
        source: "CAL_COM",
        externalId: booking.bookingUid,
        status: "UNMATCHED",
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        timezone: booking.timezone,
        location: booking.location,
        videoUrl: booking.videoUrl,
        attendeeEmail: booking.attendeeEmail,
        attendeeName: booking.attendeeName,
        notes: null,
      }),
    );
    return { action: "unmatched", meetingId: meeting.id, leadId: null };
  }

  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "The booking's lead no longer exists.");

  const meetingId = await withTransaction(async (tx) => {
    const meeting = await repo.createMeeting(tx, {
      leadId,
      companyId: scope.companyId,
      contactId: scope.primaryContactId,
      ownerId: scope.ownerId,
      source: "CAL_COM",
      externalId: booking.bookingUid,
      status: "SCHEDULED",
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone: booking.timezone,
      location: booking.location,
      videoUrl: booking.videoUrl,
      attendeeEmail: booking.attendeeEmail,
      attendeeName: booking.attendeeName,
      notes: null,
    });
    await transitionToMeetingBooked(tx, WEBHOOK_ACTOR, scope, "meeting:booked", now);
    await audit.record(tx, {
      actor: WEBHOOK_ACTOR,
      action: "acquisition.meeting.manage",
      targetType: MEETING_TARGET,
      targetId: meeting.id,
      after: { source: "CAL_COM", externalId: booking.bookingUid },
    });
    await publishMeetingBooked(tx, WEBHOOK_ACTOR, meeting.id, leadId, booking.startsAt, scope.ownerId);
    return meeting.id;
  });

  return { action: "created", meetingId, leadId };
}

async function handleBookingRescheduled(booking: NormalizedBooking, now: Date): Promise<WebhookOutcome> {
  const existing = await repo.findMeetingByExternalId("CAL_COM", booking.bookingUid);
  if (existing === null) {
    return handleBookingCreated(booking, null, now);
  }
  await withTransaction(async (tx) => {
    await repo.updateMeeting(tx, existing.id, {
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: "SCHEDULED",
      location: booking.location,
      videoUrl: booking.videoUrl,
      reminder24hSentAt: null,
      reminder1hSentAt: null,
      precallGeneratedAt: null,
    });
    await publishMeetingUpdated(tx, existing.id, existing.leadId, "SCHEDULED");
  });
  return { action: "rescheduled", meetingId: existing.id, leadId: existing.leadId };
}

async function handleBookingCancelled(booking: NormalizedBooking, now: Date): Promise<WebhookOutcome> {
  const existing = await repo.findMeetingByExternalId("CAL_COM", booking.bookingUid);
  if (existing === null) return { action: "ignored", meetingId: null, leadId: null };

  await withTransaction(async (tx) => {
    await repo.updateMeeting(tx, existing.id, { status: "CANCELLED", cancelledAt: now });
    await publishMeetingUpdated(tx, existing.id, existing.leadId, "CANCELLED");
    // A cancellation without rebooking returns the lead to REPLIED with a follow-up next action.
    if (existing.leadId !== null) {
      const scope = await repo.getLeadScope(existing.leadId);
      if (scope !== null && scope.status === "MEETING_BOOKED") {
        const result = await transitionLead(tx, {
          leadId: existing.leadId,
          to: "REPLIED",
          actor: WEBHOOK_ACTOR,
          reason: "meeting:cancelled",
        });
        await repo.setNextAction(
          tx,
          existing.leadId,
          new Date(now.getTime() + 24 * 60 * 60 * 1000),
          "Follow up after the cancelled meeting.",
        );
        await publishStatusChanged(tx, WEBHOOK_ACTOR, result.event, {
          leadId: existing.leadId,
          serviceLine: scope.serviceLine,
          market: scope.market,
        }, "meeting:cancelled");
      }
    }
  });
  return { action: "cancelled", meetingId: existing.id, leadId: existing.leadId };
}

async function transitionToMeetingBooked(
  tx: Tx,
  actor: Actor,
  scope: repo.LeadScope,
  reason: string,
  now: Date,
): Promise<void> {
  if (scope.status === "MEETING_BOOKED" || scope.status === "PROPOSAL_SENT") {
    // Booking while already in a later stage creates the meeting without a status change (§5.2).
    await repo.touchLeadActivity(tx, scope.id, now);
    return;
  }
  if (!canTransition(scope.status, "MEETING_BOOKED", scope)) {
    // A booking can still arrive for a lead that can't move to MEETING_BOOKED (for example a
    // closed or nurtured lead). Record the meeting without a status change rather than failing the
    // webhook; the owner follows up manually. The meeting row itself is created by the caller.
    pipelineLog.warn("booking recorded without a status change", { leadId: scope.id, from: scope.status });
    await repo.touchLeadActivity(tx, scope.id, now);
    return;
  }
  const result = await transitionLead(tx, { leadId: scope.id, to: "MEETING_BOOKED", actor, reason, clock: { now: () => now } });
  await stopEnrollments(tx, { companyId: scope.companyId }, "MEETING_BOOKED");
  await publishStatusChanged(tx, actor, result.event, {
    leadId: scope.id,
    serviceLine: scope.serviceLine,
    market: scope.market,
  }, reason);
}

async function publishMeetingBooked(
  tx: Tx,
  actor: Actor,
  meetingId: string,
  leadId: string,
  startsAt: Date,
  ownerId: string | null,
): Promise<void> {
  await publishAfterCommit(tx, {
    name: "meeting.booked",
    actor,
    payload: { meetingId, leadId, startsAt: startsAt.toISOString(), ownerId },
  });
}

async function publishMeetingUpdated(
  tx: Tx,
  meetingId: string,
  leadId: string | null,
  status: "SCHEDULED" | "CANCELLED" | "HELD" | "NO_SHOW" | "UNMATCHED",
): Promise<void> {
  await publishAfterCommit(tx, {
    name: "meeting.updated",
    actor: WEBHOOK_ACTOR,
    payload: { meetingId, leadId, status },
  });
}

// ---------------------------------------------------------------------------
// Meeting outcome + summary
// ---------------------------------------------------------------------------

export interface MeetingOutcomeInput {
  outcome: "HELD" | "NO_SHOW" | "RESCHEDULED";
  notes?: string | null;
  transcript?: string | null;
}

export async function recordMeetingOutcome(
  actor: Actor,
  meetingId: string,
  input: MeetingOutcomeInput,
  clock?: Clock,
): Promise<{ summarised: boolean }> {
  const meeting = await repo.getMeeting(meetingId);
  if (meeting === null) throw new AppError("NOT_FOUND", "That meeting doesn't exist.");
  if (meeting.leadId === null) throw new AppError("VALIDATION_FAILED", "Link the meeting to a lead first.");
  const leadId = meeting.leadId;
  const scope = await repo.getLeadScope(leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That meeting's lead doesn't exist.");
  await assertActorCan(actor, "acquisition.meeting.manage", {
    serviceLine: scope.serviceLine,
    ownerId: scope.ownerId,
  });

  const now = clockNow(clock);
  const notesText = [input.notes, input.transcript].filter((v): v is string => typeof v === "string" && v.trim() !== "");
  let summarised = false;

  let summary: MeetingSummary | null = null;
  let summaryAiCallId: string | null = null;
  if (input.outcome !== "RESCHEDULED" && notesText.length > 0) {
    const context = await getProfileContextForLead(scope);
    const result = await runTask<unknown, MeetingSummary>({
      task: meetingSummaryTask.id,
      input: MeetingSummaryInputSchema.parse({
        serviceLine: scope.serviceLine,
        market: scope.market,
        companyName: context.companyName,
        notes: notesText.join("\n\n"),
      }),
      actor,
      context: { leadId, companyId: scope.companyId, module: "acquisition" },
    });
    summary = result.output;
    summaryAiCallId = result.callId;
    summarised = true;
  }

  await withTransaction(async (tx) => {
    if (input.outcome === "RESCHEDULED") {
      await repo.updateMeeting(tx, meetingId, {
        status: "SCHEDULED",
        outcomeNotes: input.notes ?? null,
        transcript: input.transcript ?? meeting.transcript,
      });
      await repo.addLeadFlagEvent(tx, {
        leadId,
        actorType: actor.type,
        actorId: actor.type === "USER" ? actor.userId : null,
        actorLabel: actor.type === "SYSTEM" ? actor.job : null,
        reason: "meeting:rescheduled",
        meta: { meetingId },
      });
    } else {
      await repo.updateMeeting(tx, meetingId, {
        status: input.outcome,
        outcomeNotes: input.notes ?? null,
        transcript: input.transcript ?? meeting.transcript,
      });
      if (summary !== null) {
        await repo.setMeetingSummary(tx, meetingId, summary, summaryAiCallId);
      }
      if (input.outcome === "NO_SHOW") {
        await repo.setNextAction(
          tx,
          leadId,
          new Date(now.getTime() + 24 * 60 * 60 * 1000),
          "Follow up — prospect didn't attend.",
        );
      }
    }
    await audit.record(tx, {
      actor,
      action: "acquisition.meeting.manage",
      targetType: MEETING_TARGET,
      targetId: meetingId,
      after: { outcome: input.outcome, summarised },
    });
    await publishMeetingUpdated(
      tx,
      meetingId,
      meeting.leadId,
      input.outcome === "RESCHEDULED" ? "SCHEDULED" : input.outcome,
    );
  });

  return { summarised };
}

// ---------------------------------------------------------------------------
// Pre-call brief
// ---------------------------------------------------------------------------

async function getProfileContextForLead(scope: repo.LeadScope) {
  const [meta, company] = await Promise.all([
    repo.getCompanyMeta(scope.companyId),
    repo.getCompanySnapshot(scope.companyId),
  ]);
  const profile = await getProfileContext(scope.serviceLine, scope.market, meta?.country ?? null);
  return { ...profile, companyName: company?.name ?? "the company" };
}

/** Generates and stores the pre-call brief for a meeting. Shared by the job and on-demand use. */
export async function generatePrecallBriefForMeeting(meetingId: string, now: Date): Promise<boolean> {
  const meeting = await repo.getMeeting(meetingId);
  if (meeting === null) return false;
  if (meeting.leadId === null) return false;
  const scope = await repo.getLeadScope(meeting.leadId);
  if (scope === null) return false;

  const leadId = meeting.leadId;
  const [context, brief, conversation] = await Promise.all([
    getProfileContextForLead(scope),
    repo.getLeadBriefFields(leadId),
    repo.listConversation(leadId, 20),
  ]);
  const findings = await repo.getFindingsForLead(leadId, brief?.keyFindingIds ?? []);

  const result = await runTask<unknown, PrecallBrief>({
    task: precallBriefTask.id,
    input: PrecallBriefInputSchema.parse({
      serviceLine: scope.serviceLine,
      market: scope.market,
      companyName: context.companyName,
      leadBrief: brief?.brief ?? null,
      findings,
      conversation,
      packages: context.packages,
      portfolio: context.portfolio,
      priceRange: context.priceRange,
    }),
    actor: WEBHOOK_ACTOR,
    context: { leadId, companyId: scope.companyId, module: "acquisition" },
  });

  // The price range must come from the profile, never the model (spec §3.13, AC-33.3).
  const stored: PrecallBrief = { ...result.output, priceRangeToDiscuss: context.priceRange };

  await repo.setPrecallBrief(meetingId, stored, result.callId, now);
  if (meeting.ownerId !== null) {
    await notifySafe({
      userIds: [meeting.ownerId],
      type: PIPELINE_NOTIFICATION_TYPES.precallReady,
      title: "Pre-call brief ready",
      dedupeKey: `precall.ready:${meetingId}`,
    });
  }
  return true;
}

export async function regeneratePrecallBrief(
  actor: Actor,
  meetingId: string,
  clock?: Clock,
): Promise<{ generated: boolean }> {
  const meeting = await repo.getMeeting(meetingId);
  if (meeting === null) throw new AppError("NOT_FOUND", "That meeting doesn't exist.");
  if (meeting.leadId === null) throw new AppError("NOT_FOUND", "That meeting isn't linked to a lead.");
  const scope = await repo.getLeadScope(meeting.leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That meeting's lead doesn't exist.");
  await assertActorCan(actor, "acquisition.meeting.manage", {
    serviceLine: scope.serviceLine,
    ownerId: scope.ownerId,
  });
  const generated = await generatePrecallBriefForMeeting(meetingId, clockNow(clock));
  return { generated };
}

/** Job sweep: generate briefs for meetings within the lead-time window that have none. */
export async function generateDuePrecallBriefs(now: Date): Promise<{ generated: number }> {
  const leadMinutes = await getPrecallLeadMinutes();
  const meetings = await repo.listMeetingsNeedingPrecall(now, leadMinutes * 60 * 1000);
  let generated = 0;
  for (const meeting of meetings) {
    try {
      if (await generatePrecallBriefForMeeting(meeting.id, now)) generated += 1;
    } catch (error) {
      pipelineLog.error("pre-call brief failed", { meetingId: meeting.id, error: error instanceof Error ? error.message : "error" });
    }
  }
  return { generated };
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/** Job sweep: owner reminders 24h and 1h before (settings). Idempotent via the sent-at flags. */
export async function sendDueMeetingReminders(now: Date): Promise<{ sent: number }> {
  const offsets = await getReminderOffsetsMinutes();
  const maxOffsetMs = Math.max(0, ...offsets) * 60 * 1000;
  const meetings = await repo.listMeetingsForReminders(now, maxOffsetMs);
  let sent = 0;
  for (const meeting of meetings) {
    if (meeting.ownerId === null) continue;
    try {
      sent += await sendRemindersFor(meeting, offsets, now);
    } catch (error) {
      pipelineLog.error("meeting reminder failed", { meetingId: meeting.id, error: error instanceof Error ? error.message : "error" });
    }
  }
  return { sent };
}

async function sendRemindersFor(
  meeting: { id: string; ownerId: string | null; startsAt: Date; reminder24hSentAt: Date | null; reminder1hSentAt: Date | null },
  offsets: number[],
  now: Date,
): Promise<number> {
  if (meeting.ownerId === null) return 0;
  let sent = 0;
  const minutesUntil = (meeting.startsAt.getTime() - now.getTime()) / 60_000;
    // 24h reminder.
    if (offsets.includes(1_440) && minutesUntil <= 1_440 && meeting.reminder24hSentAt === null) {
      await notifySafe({
        userIds: [meeting.ownerId],
        type: "meeting.reminder",
        title: "Meeting in 24 hours",
        dedupeKey: `meeting.reminder.24h:${meeting.id}`,
      });
      await repo.markReminderSent(meeting.id, "reminder24hSentAt", now);
      sent += 1;
    }
    // 1h reminder.
    if (offsets.includes(60) && minutesUntil <= 60 && meeting.reminder1hSentAt === null) {
      await notifySafe({
        userIds: [meeting.ownerId],
        type: "meeting.reminder",
        title: "Meeting in 1 hour",
        dedupeKey: `meeting.reminder.1h:${meeting.id}`,
      });
      await repo.markReminderSent(meeting.id, "reminder1hSentAt", now);
      sent += 1;
    }
  return sent;
}
