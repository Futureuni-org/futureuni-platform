import "server-only";

/**
 * Ingestion (module spec §3.12, prompt step 1). Polls each active mailbox from its stored cursor,
 * normalises every inbound email, matches it to a lead/contact/message in the fixed order, stores
 * it idempotently (unique on mailbox + provider message id), and enqueues processing. Our own sent
 * copies and internal addresses are ignored.
 */

import type { Clock, ProviderId } from "@/contracts/common";
import type { InboundEmail } from "@/contracts/outreach-channel";
import { emailDomain, normalizeDomain, normalizeEmail } from "@/platform/directory";
import { enqueueJob } from "@/platform/jobs";
import { listActiveMailboxes } from "@/modules/acquisition/outreach";

import { inboxLog } from "../_shared";
import { extractHeaderSubset, normaliseBody } from "../normalize";
import {
  createReply,
  getMailboxCursor,
  matchByMessageIds,
  matchBySenderContact,
  matchBySenderDomain,
  matchByThreadId,
  saveMailboxCursor,
  touchInboxThreadInbound,
  type MatchTarget,
} from "../inbox.repo";
import { db, withTransaction } from "@/platform/db";
import { getInboundReplySource } from "./source";

const INGEST_ACTOR = { type: "SYSTEM" as const, job: "acquisition.inbox.poll" };

interface Matched { target: MatchTarget | null; method: "IN_REPLY_TO" | "THREAD_ID" | "SENDER_CONTACT" | "SENDER_DOMAIN" | "UNMATCHED" }

/** Resolves a reply to a lead/contact/message using the five-step order; UNMATCHED when none hit. */
export async function matchInbound(email: InboundEmail): Promise<Matched> {
  const headerIds = [email.inReplyTo, ...email.references].filter((v): v is string => v !== undefined && v !== "");
  const byIds = await matchByMessageIds(headerIds);
  if (byIds !== null) return { target: byIds, method: "IN_REPLY_TO" };

  const byThread = await matchByThreadId(email.providerThreadId ?? null);
  if (byThread !== null) return { target: byThread, method: "THREAD_ID" };

  const normalisedFrom = normalizeEmail(email.from.address);
  if (normalisedFrom !== null) {
    const byContact = await matchBySenderContact(normalisedFrom);
    if (byContact !== null) return { target: byContact, method: "SENDER_CONTACT" };
  }

  const domain = normalizeDomain(emailDomain(email.from.address) ?? "");
  if (domain !== null) {
    const byDomain = await matchBySenderDomain(domain);
    if (byDomain !== null) return { target: byDomain, method: "SENDER_DOMAIN" };
  }

  return { target: null, method: "UNMATCHED" };
}

/** Polls one mailbox, stores new replies and enqueues processing. Returns counts. */
export async function ingestMailbox(
  mailbox: { id: string; address: string; provider: string; credentialProvider: string },
  internalAddresses: Set<string>,
  clock: Clock,
): Promise<{ fetched: number; stored: number; unmatched: number }> {
  const source = getInboundReplySource(mailbox.provider);
  const cursor = await getMailboxCursor(mailbox.id);
  const controller = new AbortController();

  let fetched = 0;
  let stored = 0;
  let unmatched = 0;
  try {
    const { messages, nextCursor } = await source.poll(
      { id: mailbox.id, address: mailbox.address, credentialProvider: mailbox.credentialProvider as ProviderId },
      cursor,
      { clock, signal: controller.signal },
    );
    fetched = messages.length;

    for (const email of messages) {
      const from = normalizeEmail(email.from.address) ?? email.from.address.toLowerCase();
      if (internalAddresses.has(from)) continue; // our own sent copy / internal address

      const match = await matchInbound(email);
      const { rawBodySanitized, latestText } = normaliseBody(email);
      const result = await withTransaction(async (tx) => {
        const created = await createReply({
          mailboxId: mailbox.id,
          leadId: match.target?.leadId ?? null,
          contactId: match.target?.contactId ?? null,
          companyId: match.target?.companyId ?? null,
          messageId: match.target?.messageId ?? null,
          channel: "EMAIL",
          providerMessageId: email.providerMessageId,
          providerThreadId: email.providerThreadId ?? null,
          rfcMessageId: email.rfcMessageId ?? null,
          inReplyTo: email.inReplyTo ?? null,
          references: email.references,
          fromAddress: email.from.address,
          toAddress: email.to[0]?.address ?? null,
          subject: email.subject,
          receivedAt: new Date(email.date),
          headers: extractHeaderSubset(email),
          rawBodySanitized,
          latestText,
          attachmentsMeta: email.attachments.length > 0 ? email.attachments : null,
          matchMethod: match.method,
          loggedById: null,
        });
        if (created.created && match.target !== null) {
          await touchInboxThreadInbound(tx, match.target.leadId, new Date(email.date));
        }
        return created;
      });

      if (!result.created) continue;
      stored += 1;
      if (match.target === null) unmatched += 1;
      await enqueueJob("acquisition.inbox.process", { replyId: result.id }, { actor: INGEST_ACTOR });
    }

    await saveMailboxCursor(mailbox.id, nextCursor, clock.now(), null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "poll failed";
    inboxLog.error("mailbox poll failed", { mailboxId: mailbox.id, error: message });
    await saveMailboxCursor(mailbox.id, cursor, clock.now(), message.slice(0, 280));
  } finally {
    controller.abort();
  }
  return { fetched, stored, unmatched };
}

/** Polls every active mailbox (job `acquisition.inbox.poll`). */
export async function pollAllMailboxes(clock: Clock): Promise<{ mailboxes: number; fetched: number; stored: number; unmatched: number }> {
  const mailboxes = await listActiveMailboxes();
  const internal = await internalAddressSet(mailboxes.map((m) => m.address));
  let fetched = 0;
  let stored = 0;
  let unmatched = 0;
  for (const mailbox of mailboxes) {
    const r = await ingestMailbox(mailbox, internal, clock);
    fetched += r.fetched;
    stored += r.stored;
    unmatched += r.unmatched;
  }
  return { mailboxes: mailboxes.length, fetched, stored, unmatched };
}

/** Our mailbox addresses plus any configured internal sending domains, lowercased. */
async function internalAddressSet(mailboxAddresses: string[]): Promise<Set<string>> {
  const set = new Set(mailboxAddresses.map((a) => a.toLowerCase()));
  const domains = await db.sendingDomain.findMany({ select: { domain: true } });
  for (const { domain } of domains) set.add(`postmaster@${domain.toLowerCase()}`);
  return set;
}
