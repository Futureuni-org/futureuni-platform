/**
 * Consent records (Phase 9). A recorded consent overrides `CONSENT_REQUIRED` in the
 * contactability rule, and is required in the UK (INV-6) for sole traders and partnerships
 * before cold email may be sent.
 */

import "server-only";

import type { Actor, ConsentMethod, ConsentScope } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { withTransaction } from "@/platform/db";

export interface RecordConsentInput {
  contactId?: string;
  email?: string;
  scope: ConsentScope;
  method: ConsentMethod;
  evidence: string;
}

export async function recordConsent(actor: Actor, input: RecordConsentInput): Promise<{ id: string }> {
  await assertActorCan(actor, "acquisition.consent.manage");
  if ((input.contactId === undefined || input.contactId === "") && (input.email === undefined || input.email === "")) {
    throw new AppError("VALIDATION_FAILED", "Consent needs at least a contactId or an email.");
  }
  if (actor.type !== "USER") throw new AppError("FORBIDDEN", "Only a user can record consent.");
  return withTransaction(async (tx) => {
    const row = await tx.consentRecord.create({
      data: {
        ...(input.contactId === undefined ? {} : { contactId: input.contactId }),
        ...(input.email === undefined ? {} : { email: input.email.toLowerCase() }),
        scope: input.scope,
        method: input.method,
        evidence: input.evidence,
        recordedById: actor.userId,
      },
      select: { id: true },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.consent.manage",
      targetType: "ConsentRecord",
      targetId: row.id,
      after: { scope: input.scope, method: input.method, hasContact: input.contactId !== undefined },
    });
    return row;
  });
}

export async function revokeConsent(actor: Actor, id: string, reason: string): Promise<void> {
  await assertActorCan(actor, "acquisition.consent.manage");
  await withTransaction(async (tx) => {
    await tx.consentRecord.update({
      where: { id },
      data: { revokedAt: new Date(), revokedById: actor.type === "USER" ? actor.userId : null },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.consent.manage",
      targetType: "ConsentRecord",
      targetId: id,
      after: { revoked: true, reason },
    });
  });
}
