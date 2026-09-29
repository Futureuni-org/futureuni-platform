/**
 * Domain-event publishing (Phase 6, `docs/contracts/events.md`).
 *
 * - `publish(event)`: validate the envelope, run every `inline` subscriber (isolated from each
 *   other), enqueue every `job` subscriber, and return the event id.
 * - `publishAfterCommit(tx, event)`: write a `DomainEvent` outbox row inside the transaction.
 *   The row is dispatched only after commit, so a rollback emits nothing (`INV-24` for events).
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import {
  DomainEventSchema,
  type DomainEvent,
  type DomainEventName,
  type NewEvent,
} from "@/contracts/events";
import { AppError } from "@/lib/errors";
import { toJsonInput, type Tx } from "@/platform/db";

import { dispatchEvent, __outboxTicker } from "./dispatch";

interface Envelope {
  id: string;
  name: DomainEventName;
  occurredAt: string;
  actor: Actor;
  payload: unknown;
}

function makeEnvelope<N extends DomainEventName>(event: NewEvent<N>): Envelope {
  return {
    id: cuidLike(),
    name: event.name,
    occurredAt: new Date().toISOString(),
    actor: event.actor,
    payload: event.payload,
  };
}

/** A cuid-shaped random id ("c" + 24 alphanumerics); avoids adding a cuid dep at runtime. */
function cuidLike(): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "c";
  for (let i = 0; i < 24; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx] ?? "0";
  }
  return out;
}

function validate(envelope: Envelope): DomainEvent {
  const result = DomainEventSchema.safeParse(envelope);
  if (!result.success) {
    const details = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join(".") || "(event)"] = issue.message;
      return acc;
    }, {});
    throw new AppError("VALIDATION_FAILED", `Invalid event: ${envelope.name}`, { details });
  }
  return result.data;
}

/**
 * Publish now. Inline subscribers run before this resolves; job subscribers are enqueued via
 * `platform.deliver-event`. Errors from one subscriber never affect the others (see dispatch).
 */
export async function publish<N extends DomainEventName>(event: NewEvent<N>): Promise<{ eventId: string }> {
  const envelope = makeEnvelope(event);
  const validated = validate(envelope);
  await dispatchEvent(validated);
  return { eventId: validated.id };
}

/**
 * Publish after commit. Writes to the `DomainEvent` outbox in the same tx; dispatch is deferred
 * to the tick registered by the tx.
 */
export async function publishAfterCommit<N extends DomainEventName>(
  tx: Tx,
  event: NewEvent<N>,
): Promise<{ eventId: string }> {
  const envelope = makeEnvelope(event);
  const validated = validate(envelope);
  await tx.domainEvent.create({
    data: {
      id: validated.id,
      name: validated.name,
      payload: toJsonInput(validated.payload),
      actorType: validated.actor.type,
      actorId: validated.actor.type === "USER" ? validated.actor.userId : null,
      occurredAt: new Date(validated.occurredAt),
    },
  });
  // Schedule an outbox pump after the tx commits. `withTransaction` calls it on success only.
  __outboxTicker.request();
  return { eventId: validated.id };
}
