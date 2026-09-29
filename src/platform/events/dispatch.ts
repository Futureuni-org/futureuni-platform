/**
 * Subscriber dispatch and outbox pumping.
 *
 * - Inline subscribers run in the current task with per-handler try/catch. A handler that throws
 *   is logged; the other handlers still run.
 * - Job subscribers are enqueued via `platform.deliver-event` with the event id and subscriber id.
 *   A retried delivery calls the subscriber a second time; handlers must be idempotent.
 * - The outbox pump reads undispatched `DomainEvent` rows and delivers them.
 */

import "server-only";

import type {
  AnySubscriberDefinition,
  DomainEvent,
  DomainEventName,
} from "@/contracts/events";
import { db } from "@/platform/db";
import { getAllSubscribers } from "@/platform/registry";

import { platformSubscribers } from "./platform-subscribers";

const CLOCK = { now: () => new Date() };

/** Every subscriber, deduplicated by id. Platform subscribers are always present. */
function allSubscribers(): readonly AnySubscriberDefinition[] {
  const seen = new Set<string>();
  const out: AnySubscriberDefinition[] = [];
  for (const list of [platformSubscribers, getAllSubscribers()]) {
    for (const sub of list) {
      if (seen.has(sub.id)) continue;
      seen.add(sub.id);
      out.push(sub);
    }
  }
  return out;
}

function matches(sub: AnySubscriberDefinition, event: DomainEvent): boolean {
  return sub.events.includes(event.name);
}

async function runInline(sub: AnySubscriberDefinition, event: DomainEvent): Promise<void> {
  try {
    // `handler` is type-erased; the SubscriberDefinition guarantees names match at this point.
    await sub.handler(event, { clock: CLOCK });
  } catch (error) {
    // Logged, never rethrown: one subscriber never breaks another.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[events] inline subscriber ${sub.id} failed for ${event.name}: ${message}`);
  }
}

async function enqueueJob(sub: AnySubscriberDefinition, event: DomainEvent): Promise<void> {
  const { enqueueJob } = await import("@/platform/jobs");
  await enqueueJob(
    "platform.deliver-event",
    { eventId: event.id, subscriberId: sub.id },
    {
      actor: { type: "SYSTEM", job: "platform.events" },
      idempotencyKey: `platform.deliver-event:${event.id}:${sub.id}`,
    },
  );
}

/** Dispatch one already-validated event to every matching subscriber. */
export async function dispatchEvent(event: DomainEvent): Promise<void> {
  const subs = allSubscribers().filter((s) => matches(s, event));
  const inline = subs.filter((s) => s.mode === "inline");
  const jobs = subs.filter((s) => s.mode === "job");
  await Promise.all(inline.map((s) => runInline(s, event)));
  await Promise.all(jobs.map((s) => enqueueJob(s, event)));
}

/**
 * Deliver one subscriber for one event. Called by the `platform.deliver-event` job.
 * At-least-once: subscribers are idempotent on `event.id`.
 */
export async function deliverToSubscriber(eventId: string, subscriberId: string): Promise<void> {
  const sub = allSubscribers().find((s) => s.id === subscriberId);
  if (sub === undefined) return; // subscriber removed; nothing to do
  const row = await db.domainEvent.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, payload: true, actorType: true, actorId: true, occurredAt: true },
  });
  if (row === null) return;
  const event = rowToEvent(row);
  if (!matches(sub, event)) return;
  await sub.handler(event, { clock: CLOCK });
}

function rowToEvent(row: {
  id: string;
  name: string;
  payload: unknown;
  actorType: "USER" | "SYSTEM";
  actorId: string | null;
  occurredAt: Date;
}): DomainEvent {
  return {
    id: row.id,
    name: row.name as DomainEventName,
    occurredAt: row.occurredAt.toISOString(),
    actor:
      row.actorType === "USER"
        ? { type: "USER", userId: row.actorId ?? "", role: "ADMIN" }
        : { type: "SYSTEM", job: "platform.events.replay" },
    payload: row.payload as never,
  } as DomainEvent;
}

// ---- Outbox pump -----------------------------------------------------------

/**
 * A cooperative ticker for the outbox: `publishAfterCommit` requests a tick and one background
 * task drains the outbox. The pump is idempotent: two ticks in flight is safe.
 */
class OutboxTicker {
  private pending = false;
  private draining = false;

  request(): void {
    this.pending = true;
    void this.drain();
  }

  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending) {
        this.pending = false;
        const rows = await db.domainEvent.findMany({
          where: { dispatchedAt: null },
          orderBy: [{ occurredAt: "asc" }],
          take: 100,
          select: { id: true, name: true, payload: true, actorType: true, actorId: true, occurredAt: true },
        });
        for (const row of rows) {
          const event = rowToEvent(row);
          await dispatchEvent(event);
          await db.domainEvent.update({
            where: { id: row.id },
            data: { dispatchedAt: new Date() },
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }
}

export const __outboxTicker = new OutboxTicker();

/** Test helper: dispatch outbox rows synchronously. */
export async function drainOutboxNow(): Promise<void> {
  await __outboxTicker.drain();
}
