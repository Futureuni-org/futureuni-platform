import "server-only";

/**
 * Drafted responses (module spec §3.12, prompt step 5). `acquisition.inbox-draft-reply` writes a
 * short, honest reply a human reviews and sends; it never commits to prices outside the profile
 * ranges, timelines outside the catalogue or capabilities FUTUREUNI does not offer. Every
 * personalised claim is cited (INV-5): markers are validated against the supplied findings and
 * mirrored as `MessageCitation` rows. Sending goes through the single outreach path (`sendReply`).
 */

import type { Actor, Clock, Market, ReplyClass, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { assertClaimsCited, CITATION_MARKER, runTask, stripCitationMarkers } from "@/platform/ai";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";
import { getPricingForLine } from "@/modules/acquisition/profiles";
import { sendOneOffEmail } from "@/modules/acquisition/outreach";

import { ensureInboxTasksRegistered } from "../tasks";
import {
  cancelReplyDrafts,
  createReplyDraftMessage,
  getCitableFindings,
  getLeadForProcessing,
  getReplyRow,
  getThreadContext,
  getUserName,
  markReplyAnswered,
} from "../inbox.repo";
import { InboxDraftReplyInputSchema, type InboxDraftReplyInput, type InboxDraftReplyOutput } from "./schemas";

/** Classes that get a suggested response draft prepared automatically. */
const DRAFTABLE: ReadonlySet<ReplyClass> = new Set<ReplyClass>([
  "INTERESTED",
  "QUESTION",
  "OBJECTION_PRICE",
  "OBJECTION_OTHER",
  "NOT_NOW",
  "WRONG_PERSON",
]);

export function shouldDraft(classification: ReplyClass): boolean {
  return DRAFTABLE.has(classification);
}

export interface GenerateDraftArgs {
  replyId: string;
  leadId: string;
  companyId: string;
  contactId: string | null;
  serviceLine: ServiceLine;
  market: Market;
  classification: ReplyClass;
  ownerId: string | null;
  leadBrief: string | null;
  objectionSummary: string | null;
  questions: string[];
  replyText: string;
  replySubject: string | null;
  matchedMessageId: string | null;
}

/** Generates and stores a DRAFT reply message (holder for the review UI). Returns its id or null. */
export async function generateReplyDraft(args: GenerateDraftArgs, actor: Actor): Promise<{ messageId: string; needsPricingApproval: boolean } | null> {
  if (!shouldDraft(args.classification)) return null;
  ensureInboxTasksRegistered();

  const [findingsRaw, packagesRaw, thread] = await Promise.all([
    getCitableFindings(args.leadId),
    getPricingForLine(args.serviceLine, args.market),
    getThreadContext(args.leadId),
  ]);

  const findings = findingsRaw.map((f) => ({
    id: f.id,
    label: f.checkId,
    detail: f.claim.slice(0, 600),
    sourceUrl: f.sourceUrl,
  }));
  const findingIds = findings.map((f) => f.id);

  const packages = packagesRaw.flatMap((pkg) => {
    const price = pkg.prices.find((p) => p.market === args.market) ?? pkg.prices[0];
    if (price === undefined) return [];
    return [{ id: pkg.id, name: pkg.name, minMinor: price.minMinor, maxMinor: price.maxMinor, currency: price.currency }];
  });

  const bookingLink = args.classification === "INTERESTED" ? await safeBookingLink(args.leadId, args.ownerId) : null;
  const ownerName = args.ownerId === null ? "the FUTUREUNI team" : ((await getUserName(args.ownerId)) ?? "the FUTUREUNI team");

  const threadInput: InboxDraftReplyInput["thread"] = [
    ...thread.map((m) => ({
      direction: "OUTBOUND" as const,
      subject: m.subject,
      text: stripCitationMarkers(m.body).slice(0, 8_000),
    })),
    { direction: "INBOUND" as const, subject: args.replySubject, text: args.replyText.slice(0, 8_000) },
  ];

  const input = InboxDraftReplyInputSchema.parse({
    serviceLine: args.serviceLine,
    market: args.market,
    classification: args.classification,
    ownerName,
    leadBrief: args.leadBrief,
    thread: threadInput,
    objectionSummary: args.objectionSummary,
    questions: args.questions,
    findings,
    packages,
    bookingLink,
  });

  const { output, callId } = await runTask<InboxDraftReplyInput, InboxDraftReplyOutput>({
    task: "acquisition.inbox-draft-reply",
    input,
    actor,
    context: { leadId: args.leadId, companyId: args.companyId },
  });

  const body = rewriteSentinels(output.body, findingIds);
  // INV-5: every citation marker in an AI draft must reference a supplied finding. A draft that
  // fails cannot be stored for approval; `assertClaimsCited` throws CITATION_INVALID if a marker's
  // id is unknown. A reply need not always assert a prospect fact, so at-least-one is not required.
  assertClaimsCited(body, findingIds, { requireAtLeastOne: false });
  const citedFindingIds = citedIdsFrom(body, findingIds);

  const draft = await withTransaction((tx) =>
    createReplyDraftMessage(tx, {
      leadId: args.leadId,
      companyId: args.companyId,
      contactId: args.contactId,
      subject: output.subject,
      body,
      needsPricingApproval: output.needsPricingApproval,
      inReplyToMessageId: args.matchedMessageId,
      inReplyToReplyId: args.replyId,
      citedFindingIds,
      aiCallId: callId,
    }),
  );
  return { messageId: draft, needsPricingApproval: output.needsPricingApproval };
}

async function safeBookingLink(leadId: string, ownerId: string | null): Promise<string | null> {
  try {
    const { getBookingLink } = await import("@/modules/acquisition/pipeline");
    return await getBookingLink(leadId, ownerId ?? undefined);
  } catch {
    return null;
  }
}

/** Replaces `__CITEn__` sentinels (mock fixtures) with real finding ids; strips unmatched markers. */
function rewriteSentinels(text: string, findingIds: string[]): string {
  let out = text.replace(/__CITE(\d+)__/g, (_m, n: string) => {
    const idx = Number.parseInt(n, 10) - 1;
    return findingIds[idx] ?? "__MISSING__";
  });
  out = out.replace(/\[\[(?:f|s):__MISSING__\]\]/g, "");
  return out;
}

function citedIdsFrom(body: string, findingIds: string[]): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(CITATION_MARKER)) {
    const id = match[2];
    if (id !== undefined && findingIds.includes(id)) ids.add(id);
  }
  return [...ids];
}

// ---- Sending ----

export interface SendReplyInput {
  subject?: string;
  body: string;
  humanConfirmedClaims: boolean;
}

/** Sends a human-confirmed reply through the outreach one-off path and closes the SLA timer. */
export async function sendReply(actor: Actor, replyId: string, input: SendReplyInput, clock?: Clock): Promise<{ messageId: string }> {
  if (!input.humanConfirmedClaims) {
    throw new AppError("VALIDATION_FAILED", "A reply needs humanConfirmedClaims = true.");
  }
  const reply = await getReplyRow(replyId);
  if (reply === null) throw new AppError("NOT_FOUND", "Reply not found.");
  if (reply.leadId === null) throw new AppError("NOT_FOUND", "Reply is not linked to a lead.");
  const lead = await getLeadForProcessing(reply.leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");
  await assertActorCan(actor, "acquisition.inbox.reply", {
    serviceLine: lead.serviceLine,
    ...(lead.ownerId === null ? {} : { ownerId: lead.ownerId }),
  });

  const contactId = reply.contactId ?? lead.primaryContactId;
  if (contactId === null) throw new AppError("VALIDATION_FAILED", "No contact to reply to; link the reply first.");

  const subject = input.subject ?? `Re: ${reply.subject ?? "your message"}`.slice(0, 200);
  const { messageId } = await sendOneOffEmail(actor, {
    leadId: reply.leadId,
    contactId,
    subject,
    body: input.body,
    ...(reply.messageId === null ? {} : { inReplyToMessageId: reply.messageId }),
    humanConfirmedClaims: true,
  });

  const now = clock?.now() ?? new Date();
  await withTransaction(async (tx) => {
    await markReplyAnswered(tx, replyId, now);
    await cancelReplyDrafts(tx, replyId);
    await audit.record(tx, {
      actor,
      action: "acquisition.inbox.reply",
      targetType: "Reply",
      targetId: replyId,
      after: { messageId },
    });
  });
  return { messageId };
}
