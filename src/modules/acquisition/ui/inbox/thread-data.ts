import "server-only";

import type { Actor, EmailStatus } from "@/contracts/common";
import { stripCitationMarkers } from "@/platform/ai";
import { getThread } from "@/modules/acquisition/inbox";

import { getThreadExtras } from "./thread.repo";
import type { ThreadActionTaken, ThreadReplyView, ThreadView } from "./thread-types";

/**
 * Loads one lead's conversation as a plain view: the inbox service's thread (which authorises
 * `acquisition.inbox.read`) merged with the channel, citations, follow-up date and referral it
 * doesn't return yet. Shared by the inbox screen and the lead-detail Conversation tab.
 */

const EMAIL_STATUSES: readonly EmailStatus[] = [
  "UNVERIFIED",
  "VALID",
  "RISKY",
  "INVALID",
  "UNKNOWN",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The actions logged against a reply. An entry logged twice is listed once. */
function parseActions(value: unknown): ThreadActionTaken[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const action = str(entry.action);
    const at = str(entry.at);
    if (action === null || at === null) return [];
    const detail = str(entry.detail);
    const key = `${action}|${at}|${detail ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ action, at, detail }];
  });
}

function parseReferral(value: unknown): ThreadReplyView["referral"] {
  if (!isRecord(value)) return null;
  const name = str(value.name);
  const email = str(value.email);
  if (name === null && email === null) return null;
  const verification = EMAIL_STATUSES.find((s) => s === value.verification) ?? null;
  return { name, email, verification };
}

export async function loadThread(actor: Actor, leadId: string): Promise<ThreadView> {
  // getThread authorises first; only read the extras once it has passed.
  const thread = await getThread(actor, leadId);
  const extras = await getThreadExtras(leadId);

  return {
    messages: thread.messages.map((m) => {
      const extra = extras.messages.get(m.id);
      return {
        id: m.id,
        kind: m.kind,
        status: m.status,
        channel: extra?.channel ?? "EMAIL",
        subject: m.subject,
        // Stored bodies keep internal citation markers ("[[f:<id>]]") for review. They are never
        // shown or put in the composer: the cited findings travel in `citations` instead.
        body: stripCitationMarkers(m.body),
        sentAt: m.sentAt === null ? null : m.sentAt.toISOString(),
        createdAt: m.createdAt.toISOString(),
        needsPricingApproval: m.needsPricingApproval,
        inReplyToReplyId: m.inReplyToReplyId,
        citations: extra?.citations ?? [],
      };
    }),
    replies: thread.replies.map((r) => {
      const extra = extras.replies.get(r.id);
      return {
        id: r.id,
        channel: r.channel,
        classification: r.classification,
        confidence: r.confidence,
        summary: r.summary,
        text: r.latestText,
        receivedAt: r.receivedAt.toISOString(),
        unread: r.readAt === null,
        slaStatus: r.slaStatus,
        slaDueAt: r.slaDueAt === null ? null : r.slaDueAt.toISOString(),
        needsHumanReview: r.needsHumanReview,
        objectionSummary: r.objectionSummary,
        // The same question extracted twice is shown once.
        questions: [...new Set(r.questions)],
        followUpDate: extra?.followUpDate == null ? null : extra.followUpDate.toISOString(),
        referral: parseReferral(extra?.referral),
        actionsTaken: parseActions(r.actionsTaken),
      };
    }),
  };
}
