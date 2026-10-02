import "server-only";

/**
 * Mock inbound reply source (ADR-005). Tests inject scripted replies per mailbox address with
 * `enqueueMockReplies`; `poll` returns the ones after the caller's cursor and advances it, so a
 * re-poll with the returned cursor yields nothing (the store's unique key also guards duplicates).
 * Covers every reply class and edge case the integration tests need.
 */

import type { InboundEmail, InboundReplySource } from "@/contracts/outreach-channel";

const queues = new Map<string, InboundEmail[]>();

/** Appends scripted replies for a mailbox address (used by tests and local tooling). */
export function enqueueMockReplies(mailboxAddress: string, messages: InboundEmail[]): void {
  const existing = queues.get(mailboxAddress.toLowerCase()) ?? [];
  queues.set(mailboxAddress.toLowerCase(), [...existing, ...messages]);
}

/** Clears every mailbox's scripted queue (test setup/teardown). */
export function resetMockReplies(): void {
  queues.clear();
}

export const mockInboundSource: InboundReplySource = {
  id: "mock",
  poll: (mailbox, cursor) => {
    const all = queues.get(mailbox.address.toLowerCase()) ?? [];
    const from = cursor === null ? 0 : Number.parseInt(cursor, 10);
    const start = Number.isFinite(from) && from > 0 ? from : 0;
    const messages = all.slice(start);
    return Promise.resolve({ messages, nextCursor: String(all.length) });
  },
};
