import "server-only";

/**
 * Provided seam SEAM-RECORD-BOUNCE (wave-3 guide Part B2). A hard bounce adds an EMAIL suppression,
 * stops the company's enrolments (INV-2, INV-3), marks the contact's email invalid, and records a
 * tracking event; a soft bounce is retried twice, then treated as hard (step 4.9). The suppression
 * cascade runs directly here (recordBounce is a trusted system entrypoint with no actor, like the
 * send path's inline checks) rather than through the permission-gated `addSuppression`; see
 * phases/12/REQUESTS.md for the integration note.
 */

import { createHash } from "node:crypto";

import { BounceInputSchema, type RecordBounce } from "@/contracts/outreach-channel";
import { isUniqueViolation, withSavepoint, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { normalizeSuppressionValue } from "@/modules/acquisition/core";

import { SOFT_BOUNCE_MAX_RETRIES } from "../settings";
import { stopEnrollments } from "../sequences/stop";
import { bumpDailyCounter } from "../mailboxes/mailbox.repo";
import { findMessage, findMessageByProviderId } from "./email.repo";

async function runInTx<T>(tx: unknown, fn: (t: Tx) => Promise<T>): Promise<T> {
  const existing = tx as Tx | null | undefined;
  if (existing != null) return fn(existing);
  return withTransaction(fn);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export const recordBounce: RecordBounce = async (tx, rawInput) => {
  const input = BounceInputSchema.parse(rawInput);
  const normalisedEmail = normalizeSuppressionValue("EMAIL", input.email) ?? input.email.toLowerCase();

  await runInTx(tx, async (t) => {
    const message =
      input.messageId !== undefined
        ? await findMessage(t, input.messageId)
        : input.providerMessageId !== undefined
          ? await findMessageByProviderId(t, input.providerMessageId)
          : null;

    if (input.kind === "SOFT") {
      await recordSoftBounce(t, message?.id ?? null, message?.mailboxId ?? null, input.detail, new Date());
      const softCount = message === null
        ? 1
        : await t.trackingEvent.count({ where: { messageId: message.id, type: "BOUNCED_SOFT" } });
      if (softCount < SOFT_BOUNCE_MAX_RETRIES) {
        await publishAfterCommit(t, {
          name: "outreach.bounce.recorded",
          actor: { type: "SYSTEM", job: "acquisition.outreach.bounce" },
          payload: { emailHash: sha256(normalisedEmail), kind: "SOFT", messageId: message?.id ?? null },
        });
        return;
      }
      // Escalate: too many soft bounces behave as a hard bounce.
    }

    await applyHardBounce(t, {
      normalisedEmail,
      messageId: message?.id ?? null,
      mailboxId: message?.mailboxId ?? null,
      companyId: message?.companyId ?? null,
      contactId: message?.contactId ?? null,
      detail: input.detail,
    });
  });
};

async function recordSoftBounce(
  t: Tx,
  messageId: string | null,
  mailboxId: string | null,
  detail: string,
  occurredAt: Date,
): Promise<void> {
  await t.trackingEvent.create({
    data: {
      ...(messageId === null ? {} : { messageId }),
      ...(mailboxId === null ? {} : { mailboxId }),
      type: "BOUNCED_SOFT",
      provider: "outreach",
      occurredAt,
      payload: { detail },
    },
  });
  if (mailboxId !== null) await bumpDailyCounter(t, mailboxId, occurredAt, "bouncesSoft");
}

async function applyHardBounce(
  t: Tx,
  args: {
    normalisedEmail: string;
    messageId: string | null;
    mailboxId: string | null;
    companyId: string | null;
    contactId: string | null;
    detail: string;
  },
): Promise<void> {
  const now = new Date();

  // 1. Idempotent EMAIL suppression (INV-2). A savepoint keeps the tx usable on a unique conflict.
  try {
    await withSavepoint(t, () =>
      t.suppression.create({
        data: { type: "EMAIL", value: args.normalisedEmail, reason: "BOUNCE", source: "BOUNCE", note: args.detail.slice(0, 500) },
      }),
    );
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }

  // 2. Stop the company's enrolments (INV-3).
  if (args.companyId !== null) await stopEnrollments(t, { companyId: args.companyId }, "BOUNCE");

  // 3. Mark the contact's email invalid.
  if (args.contactId !== null) {
    await t.contact.updateMany({ where: { id: args.contactId }, data: { emailStatus: "INVALID" } });
  }

  // 4. Tracking event + mailbox health counter.
  await t.trackingEvent.create({
    data: {
      ...(args.messageId === null ? {} : { messageId: args.messageId }),
      ...(args.mailboxId === null ? {} : { mailboxId: args.mailboxId }),
      type: "BOUNCED_HARD",
      provider: "outreach",
      occurredAt: now,
      payload: { detail: args.detail },
    },
  });
  if (args.mailboxId !== null) await bumpDailyCounter(t, args.mailboxId, now, "bouncesHard");

  await publishAfterCommit(t, {
    name: "outreach.bounce.recorded",
    actor: { type: "SYSTEM", job: "acquisition.outreach.bounce" },
    payload: { emailHash: sha256(args.normalisedEmail), kind: "HARD", messageId: args.messageId },
  });
}
