"use server";

/**
 * Server actions for the pipeline board. Every move goes through the pipeline service's `moveLead`
 * (which authorises `acquisition.pipeline.move` and delegates to the meeting, nurture and
 * transition services), so the board can't make a move the transitions table doesn't allow. Won
 * and Lost use the shared dialogs and their own actions (`../leads/detail-actions`).
 */

import { z } from "zod";

import { IdSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { ok, type ActionResult } from "@/lib/result";
import { actorOf, assertActorCan, requireUser } from "@/platform/auth";
import { getBookingLink, moveLead } from "@/modules/acquisition/pipeline";

import { failed } from "../leads/action-result";
import { getLeadScope, leadResource } from "../leads/lead-detail.repo";

type Done = ActionResult<{ ok: true }>;
const DONE = { ok: true } as const;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

const IsoDate = z.iso.datetime();
const OptionalText = (max: number) => z.string().trim().max(max).nullish();

export async function moveToConversationAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await moveLead(actor, parse(IdSchema, leadId), { to: "REPLIED" });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

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

export async function moveToMeetingAction(
  leadId: string,
  input: z.input<typeof MeetingSchema>,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const m = parse(MeetingSchema, input);
    await moveLead(actor, parse(IdSchema, leadId), {
      to: "MEETING_BOOKED",
      startsAt: new Date(m.startsAt),
      endsAt: new Date(m.endsAt),
      location: m.location ?? null,
      notes: m.notes ?? null,
    });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function moveToNurtureAction(
  leadId: string,
  until: string,
  note: string | null,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await moveLead(actor, parse(IdSchema, leadId), {
      to: "NURTURE",
      until: new Date(parse(IsoDate, until)),
      note: parse(OptionalText(500), note) ?? null,
    });
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

/**
 * The lead's booking link, to send to the prospect instead of logging a manual meeting.
 * `getBookingLink` does no permission check of its own, so this authorises
 * `acquisition.meeting.manage` against the lead's line and owner first.
 */
export async function boardBookingLinkAction(
  leadId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const scope = await getLeadScope(id);
    if (scope === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.meeting.manage", leadResource(scope));
    return ok({ url: await getBookingLink(id, scope.ownerId ?? undefined) });
  } catch (error) {
    return failed(error);
  }
}
