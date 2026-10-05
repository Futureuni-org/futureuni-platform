import "server-only";

/**
 * Server-side loaders for the inbox screen. Threads and unmatched replies come from the inbox
 * service (which authorises and scopes a member to their own threads); the context rail reads the
 * lead header. Everything is mapped to the plain views in `inbox-types.ts`.
 */

import {
  IdSchema,
  ReplyClassSchema,
  SlaStatusSchema,
  type Actor,
  type Market,
  type ServiceLine,
} from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { getUnmatchedReplies, listThreads } from "@/modules/acquisition/inbox";

import { lineHref } from "@/modules/acquisition/ui/shell";
import { getLeadHeader, getLeadScope } from "../leads/lead-detail.repo";
import {
  newestFirst,
  type InboxFilters,
  type ThreadContextView,
  type ThreadRowView,
  type UnmatchedReplyView,
} from "./inbox-types";

const PAGE = 30;
const MAX = 100;

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

export function parseInboxFilters(sp: Record<string, string | string[] | undefined>): InboxFilters {
  const classification = ReplyClassSchema.safeParse(one(sp.class));
  const slaStatus = SlaStatusSchema.safeParse(one(sp.sla));
  const marketRaw = one(sp.market);
  const market: Market | undefined =
    marketRaw === "NIGERIA" || marketRaw === "INTERNATIONAL" ? marketRaw : undefined;
  const owner = IdSchema.safeParse(one(sp.owner));
  const thread = IdSchema.safeParse(one(sp.thread));
  const limitRaw = Number.parseInt(one(sp.limit) ?? "", 10);

  return {
    tab: one(sp.tab) === "unmatched" ? "unmatched" : "threads",
    classification: classification.success ? classification.data : undefined,
    slaStatus: slaStatus.success ? slaStatus.data : undefined,
    market,
    ownerId: owner.success ? owner.data : undefined,
    unread: one(sp.unread) === "1",
    needsReview: one(sp.review) === "1",
    limit: Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, PAGE), MAX) : PAGE,
    thread: thread.success ? thread.data : undefined,
  };
}

export async function loadThreadRows(
  actor: Actor,
  serviceLine: ServiceLine,
  filters: InboxFilters,
  ownerNames: ReadonlyMap<string, string>,
): Promise<{ rows: ThreadRowView[]; hasMore: boolean }> {
  const page = await listThreads(actor, {
    serviceLine,
    limit: filters.limit,
    ...(filters.market === undefined ? {} : { market: filters.market }),
    ...(filters.classification === undefined ? {} : { classification: filters.classification }),
    ...(filters.slaStatus === undefined ? {} : { slaStatus: filters.slaStatus }),
    ...(filters.ownerId === undefined ? {} : { ownerId: filters.ownerId }),
    ...(filters.unread ? { unread: true } : {}),
    ...(filters.needsReview ? { needsHumanReview: true } : {}),
  });

  const rows = page.items.map((item): ThreadRowView => {
    const sla = SlaStatusSchema.safeParse(item.slaStatus);
    return {
      leadId: item.leadId,
      companyName: item.companyName,
      market: item.market,
      ownerId: item.ownerId,
      ownerName: item.ownerId === null ? null : (ownerNames.get(item.ownerId) ?? null),
      classification: item.classification,
      slaStatus: sla.success ? sla.data : "NONE",
      slaDueAt: item.slaDueAt,
      summary: item.summary,
      unread: item.unread,
      needsHumanReview: item.needsHumanReview,
      latestAt: item.latestAt,
    };
  });

  // The service returns one row per lead ordered by lead id, not by date, so the rows are put in
  // date order here. It also pages by date; the screen simply asks for a longer list ("Load
  // more"), up to MAX. See CR-16-GAP-INBOX-LIST: until the service orders by date, the rows it
  // picks for a short list aren't necessarily the newest ones.
  return { rows: newestFirst(rows), hasMore: page.nextCursor !== null && filters.limit < MAX };
}

/**
 * Replies that couldn't be matched to a lead, or null when this person may not see them. Only a
 * refusal means "not for you"; any other failure is a real one and is thrown, so an outage never
 * reads as an empty list.
 */
export async function loadUnmatched(actor: Actor): Promise<UnmatchedReplyView[] | null> {
  try {
    const replies = await getUnmatchedReplies(actor);
    return replies.map((reply) => ({
      id: reply.id,
      fromAddress: reply.fromAddress,
      subject: reply.subject,
      summary: reply.summary,
      receivedAt: reply.receivedAt,
    }));
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") return null;
    throw error;
  }
}

/** True when the lead exists and belongs to this service line. */
export async function isLeadInLine(leadId: string, serviceLine: ServiceLine): Promise<boolean> {
  const scope = await getLeadScope(leadId);
  return scope?.serviceLine === serviceLine;
}

/** The lead behind a thread, for the context rail; null when it isn't in this line. */
export async function loadThreadContext(
  leadId: string,
  serviceLine: ServiceLine,
): Promise<ThreadContextView | null> {
  const header = await getLeadHeader(leadId);
  if (header?.serviceLine !== serviceLine) return null;

  const primary = header.contacts.find((contact) => contact.isPrimary) ?? null;
  const place = [header.company.city, header.country ?? header.company.country]
    .filter((v) => v !== null && v !== "")
    .join(", ");
  const verdict = header.contactability;

  return {
    leadId: header.id,
    leadHref: lineHref(serviceLine, `leads/${header.id}`),
    companyName: header.company.name,
    place: place === "" ? null : place,
    status: header.status,
    market: header.market,
    score: header.score,
    scoreBand: header.scoreBand,
    brief: header.brief,
    ownerId: header.owner?.id ?? null,
    ownerName: header.owner?.name ?? null,
    primaryContact:
      primary === null ? null : { name: primary.name, role: primary.role, email: primary.email },
    channels:
      verdict === null
        ? []
        : [
            { name: "Email", status: verdict.email.status, reason: verdict.email.reason },
            { name: "WhatsApp", status: verdict.whatsapp.status, reason: verdict.whatsapp.reason },
            { name: "LinkedIn", status: verdict.linkedin.status, reason: verdict.linkedin.reason },
            { name: "Phone", status: verdict.phone.status, reason: verdict.phone.reason },
          ],
  };
}
