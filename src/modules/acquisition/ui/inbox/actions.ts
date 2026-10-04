"use server";

/**
 * Server actions for the inbox screen. Each authenticates, parses with Zod and delegates to the
 * inbox service, which authorises and audits. A reply is only ever sent with the human's explicit
 * confirmation (INV-5), and reclassifying to UNSUBSCRIBE suppresses through the service before
 * anything else can be sent (INV-23). Where the service leaves a rule unchecked (who a thread can
 * be assigned to, whether a reply is still unmatched, whether a reply may be answered at all), the
 * action checks it first; each of those is also raised in phases/16/REQUESTS.md.
 */

import { z } from "zod";

import { IdSchema, ReplyClassSchema, ServiceLineSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { ok, type ActionResult } from "@/lib/result";
import { stripCitationMarkers } from "@/platform/ai";
import { actorOf, assertActorCan, canFromUser, requireUser } from "@/platform/auth";
import {
  assignThread,
  generateReplyDraft,
  linkReply,
  logAssistedReply,
  markRead,
  markUnread,
  reclassify,
  sendReply,
  snoozeThread,
} from "@/modules/acquisition/inbox";

import { failed, sendResultFor } from "../leads/action-result";
import { getLeadScope, isOnLineTeam, leadResource } from "../leads/lead-detail.repo";
import { listLeads } from "../leads/leads-list.repo";
import type { SendResult } from "../leads/send-outcome";
import { getDraftContext, getDraftMessage, getReplyLink } from "./inbox.repo";
import { replyBlock, type ComposerDraft, type ReplyBlock } from "./inbox-types";

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

/** The error for a reply that may not be answered (INV-23). */
function blockedError(block: ReplyBlock): AppError {
  return new AppError(block.reason === "bounced" ? "CONTACT_BLOCKED" : "SUPPRESSED", block.message);
}

// ---- Read state, assignment, snooze -----------------------------------------------------------

export async function markThreadReadAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await markRead(actor, parse(IdSchema, leadId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function markThreadUnreadAction(leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await markUnread(actor, parse(IdSchema, leadId));
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function assignThreadAction(leadId: string, userId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, leadId);
    const assigneeId = parse(IdSchema, userId);
    const scope = await getLeadScope(id);
    if (scope === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.inbox.assign", leadResource(scope));
    // The service makes any user id the lead's owner. The new owner must be an active member of
    // this line's team, the same rule a lead reassignment applies.
    if (!(await isOnLineTeam(assigneeId, scope.serviceLine))) {
      throw new AppError("VALIDATION_FAILED", "That teammate isn't on this service line.");
    }
    await assignThread(actor, id, assigneeId);
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export async function snoozeThreadAction(leadId: string, until: string | null): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await snoozeThread(
      actor,
      parse(IdSchema, leadId),
      until === null ? null : new Date(parse(IsoDate, until)),
    );
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Reclassify -------------------------------------------------------------------------------

export async function reclassifyReplyAction(
  replyId: string,
  newClass: string,
  note: string | null,
): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    await reclassify(
      actor,
      parse(IdSchema, replyId),
      parse(ReplyClassSchema, newClass),
      parse(z.string().trim().max(500).nullable(), note),
    );
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

// ---- Suggested response and sending -----------------------------------------------------------

/**
 * Asks the inbox service for a fresh suggested response to a reply and returns it, so the composer
 * can show or offer it straight away. The service function takes its arguments ready-made and
 * doesn't authorise, so this checks `acquisition.inbox.reply` against the lead first and assembles
 * them from the reply and lead rows.
 */
export async function regenerateDraftAction(replyId: string): Promise<ActionResult<ComposerDraft>> {
  try {
    const actor = actorOf(await requireUser());
    const context = await getDraftContext(parse(IdSchema, replyId));
    if (context === null) throw new AppError("NOT_FOUND", "Reply not found.");
    const { reply, lead } = context;

    await assertActorCan(actor, "acquisition.inbox.reply", leadResource(lead));
    // No suggested response for a reply that can't be answered.
    const block = replyBlock(reply.classification, lead.status);
    if (block !== null) throw blockedError(block);
    if (reply.classification === null) {
      throw new AppError(
        "CONFLICT",
        "This reply hasn't been classified yet. Try again in a moment.",
      );
    }

    const generated = await generateReplyDraft(
      {
        replyId: reply.id,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: reply.contactId ?? lead.primaryContactId,
        serviceLine: lead.serviceLine,
        market: lead.market,
        classification: reply.classification,
        ownerId: lead.ownerId,
        leadBrief: lead.brief,
        objectionSummary: reply.objectionSummary,
        questions: reply.questions,
        replyText: reply.latestText,
        replySubject: reply.subject,
        matchedMessageId: reply.messageId,
      },
      actor,
    );
    if (generated === null) {
      throw new AppError("CONFLICT", "This kind of reply doesn't get a suggested response.");
    }
    const message = await getDraftMessage(generated.messageId);
    if (message === null) throw new AppError("NOT_FOUND", "The suggested response wasn't saved.");
    return ok({
      id: message.id,
      subject: message.subject,
      // The stored body keeps internal citation markers; they never reach the composer.
      body: stripCitationMarkers(message.body),
      needsPricingApproval: generated.needsPricingApproval,
      citations: message.citations,
    });
  } catch (error) {
    return failed(error);
  }
}

const SendSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(20000),
  humanConfirmedClaims: z.literal(true, { error: "Confirm the reply before sending." }),
});

/**
 * Sends the confirmed reply and reports what happened to it: sent, scheduled for the next sending
 * window, or blocked. The service returns only a message id, so the outcome is read back from the
 * message.
 */
export async function sendReplyAction(
  replyId: string,
  input: z.input<typeof SendSchema>,
): Promise<ActionResult<SendResult>> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, replyId);
    const send = parse(SendSchema, input);

    const context = await getDraftContext(id);
    if (context === null) throw new AppError("NOT_FOUND", "Reply not found.");
    await assertActorCan(actor, "acquisition.inbox.reply", leadResource(context.lead));
    // An unsubscribe is never answered (INV-23), and neither is a bounce or a suppressed lead. The
    // service doesn't check the reply's class, so it is refused here.
    const block = replyBlock(context.reply.classification, context.lead.status);
    if (block !== null) throw blockedError(block);

    const { messageId } = await sendReply(actor, id, {
      body: send.body,
      humanConfirmedClaims: true,
      ...(send.subject === undefined || send.subject === "" ? {} : { subject: send.subject }),
    });
    return ok(await sendResultFor(messageId));
  } catch (error) {
    return failed(error);
  }
}

// ---- Assisted replies and unmatched replies ---------------------------------------------------

// No received-at time: the server stamps the reply when it is logged. A time supplied by the
// browser could backdate a reply and with it the response timer.
const AssistedSchema = z.object({
  leadId: IdSchema,
  channel: z.enum(["WHATSAPP", "LINKEDIN", "PHONE"]),
  text: z.string().trim().min(1).max(12000),
});

export async function logAssistedReplyAction(
  input: z.input<typeof AssistedSchema>,
): Promise<ActionResult<{ replyId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const assisted = parse(AssistedSchema, input);
    return ok(
      await logAssistedReply(actor, {
        leadId: assisted.leadId,
        channel: assisted.channel,
        text: assisted.text,
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function linkReplyAction(replyId: string, leadId: string): Promise<Done> {
  try {
    const actor = actorOf(await requireUser());
    const id = parse(IdSchema, replyId);
    const targetId = parse(IdSchema, leadId);

    const scope = await getLeadScope(targetId);
    if (scope === null) throw new AppError("NOT_FOUND", "Lead not found.");
    await assertActorCan(actor, "acquisition.inbox.link", leadResource(scope));

    // Only an unmatched reply can be linked. The service would move a reply that already belongs to
    // a lead, taking it out of that lead's conversation and re-running its actions on another.
    const link = await getReplyLink(id);
    if (link === null) throw new AppError("NOT_FOUND", "Reply not found.");
    if (link.leadId !== null) {
      throw new AppError("CONFLICT", "This reply is already linked to a lead.");
    }

    await linkReply(actor, id, targetId);
    return ok(DONE);
  } catch (error) {
    return failed(error);
  }
}

export interface LeadMatch {
  id: string;
  companyName: string;
  place: string | null;
}

/**
 * Leads in a line matching a search, for linking an unmatched reply. Limited to the people who may
 * link in that line; the search text is length-capped here and matched literally by `listLeads`
 * (`%` and `_` are escaped there).
 */
export async function searchLeadsAction(
  serviceLine: string,
  query: string,
): Promise<ActionResult<LeadMatch[]>> {
  try {
    const user = await requireUser();
    const line = parse(ServiceLineSchema, serviceLine);
    const q = parse(z.string().trim().min(2).max(80), query);
    if (
      !canFromUser(user, "acquisition.lead.read", { serviceLine: line }) ||
      !canFromUser(user, "acquisition.inbox.link", { serviceLine: line })
    ) {
      throw new AppError("FORBIDDEN", "You can only search leads in the service lines you manage.");
    }
    const page = await listLeads({
      serviceLine: line,
      filter: { q, flags: [], dateField: "created" },
      limit: 8,
    });
    return ok(
      page.items.map((lead) => ({
        id: lead.id,
        companyName: lead.companyName,
        place: [lead.city, lead.country].filter((v) => v !== null && v !== "").join(", ") || null,
      })),
    );
  } catch (error) {
    return failed(error);
  }
}
