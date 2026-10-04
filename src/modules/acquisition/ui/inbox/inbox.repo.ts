import "server-only";

/**
 * The reply and lead fields the inbox actions need before they call the inbox service.
 * `generateReplyDraft` takes a fully assembled argument object and does not load or authorise
 * anything itself (it was written for the reply-processing job), so a "regenerate" from the screen
 * has to read these and authorise first. See CR-16-GAP-REGENERATE-DRAFT in phases/16/REQUESTS.md.
 * The other reads back the guards the actions add around the service: whether a reply is already
 * linked, and the text of a draft that was just generated.
 */

import { db } from "@/platform/db";

export async function getDraftContext(replyId: string) {
  const reply = await db.reply.findUnique({
    where: { id: replyId },
    select: {
      id: true,
      leadId: true,
      contactId: true,
      messageId: true,
      classification: true,
      objectionSummary: true,
      questions: true,
      latestText: true,
      subject: true,
    },
  });
  // An unmatched reply has no lead yet, so there is nothing to draft a response for.
  const leadId = reply?.leadId ?? null;
  if (reply === null || leadId === null) return null;

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyId: true,
      serviceLine: true,
      market: true,
      status: true,
      ownerId: true,
      primaryContactId: true,
      brief: true,
    },
  });
  if (lead === null) return null;

  return { reply, lead };
}

/** The lead a reply is linked to (null while it is unmatched), or null when the reply doesn't exist. */
export async function getReplyLink(replyId: string): Promise<{ leadId: string | null } | null> {
  return db.reply.findUnique({ where: { id: replyId }, select: { leadId: true } });
}

/** A draft message's text and the findings it cites, for loading into the composer. */
export async function getDraftMessage(messageId: string) {
  const message = await db.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      subject: true,
      body: true,
      citations: {
        select: {
          finding: { select: { id: true, claim: true } },
          signal: { select: { id: true, evidenceText: true } },
        },
      },
    },
  });
  if (message === null) return null;
  return {
    id: message.id,
    subject: message.subject,
    body: message.body,
    citations: message.citations.flatMap((c) => {
      if (c.finding !== null) return [{ id: c.finding.id, claim: c.finding.claim }];
      if (c.signal !== null) return [{ id: c.signal.id, claim: c.signal.evidenceText }];
      return [];
    }),
  };
}
