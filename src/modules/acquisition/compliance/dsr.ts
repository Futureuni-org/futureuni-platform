/**
 * Data-subject requests (Phase 9, `docs/specs/module-acquisition.md` §3.6, INV-10).
 *
 * - `createDataSubjectRequest` records the request.
 * - `fulfilExport` gathers everything held about the subject into a JSON file stored via
 *   `@/platform/storage`, and returns a signed URL.
 * - `fulfilDelete` anonymises the contact's personal fields and re-suppresses via a hash so the
 *   person is never sourced again, but their plain data isn't kept.
 */

import "server-only";

import type { Actor, DsrStatus } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { db, withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { putFile, getSignedUrl } from "@/platform/storage";
import { hashSuppressionValue, normalizeSuppressionValue } from "@/modules/acquisition/core";

import { addSuppression } from "./suppression";

export interface CreateDsrInput {
  type: "EXPORT" | "DELETE";
  email?: string;
  phone?: string;
  requestedBy: string;
  notes?: string;
}

export async function createDataSubjectRequest(actor: Actor, input: CreateDsrInput): Promise<{ id: string; status: DsrStatus }> {
  await assertActorCan(actor, "acquisition.dsr.manage");
  if ((input.email ?? "") === "" && (input.phone ?? "") === "") {
    throw new AppError("VALIDATION_FAILED", "A data-subject request needs an email or a phone.");
  }
  if (actor.type !== "USER") throw new AppError("FORBIDDEN", "Only a user can create a DSR.");
  return withTransaction(async (tx) => {
    const row = await tx.dataSubjectRequest.create({
      data: {
        type: input.type,
        status: "OPEN",
        ...(input.email === undefined ? {} : { subjectEmail: input.email.toLowerCase() }),
        ...(input.phone === undefined ? {} : { subjectPhone: input.phone }),
        requestedBy: input.requestedBy,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        createdById: actor.userId,
      },
      select: { id: true, status: true },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.dsr.manage",
      targetType: "DataSubjectRequest",
      targetId: row.id,
      after: { type: input.type, hasEmail: input.email !== undefined, hasPhone: input.phone !== undefined },
    });
    return row;
  });
}

/** Fulfil an EXPORT: gather everything held about the subject, write it to storage, return the signed URL. */
export async function fulfilExport(actor: Actor, id: string): Promise<{ url: string }> {
  await assertActorCan(actor, "acquisition.dsr.manage");
  if (actor.type !== "USER") throw new AppError("FORBIDDEN", "Only a user can fulfil a DSR.");
  const request = await db.dataSubjectRequest.findUnique({
    where: { id },
    select: { id: true, type: true, subjectEmail: true, subjectPhone: true, status: true },
  });
  if (request === null) throw new AppError("NOT_FOUND", "DSR not found.");
  if (request.type !== "EXPORT") throw new AppError("INVALID_TRANSITION", "This DSR is not an EXPORT.");
  if (request.status !== "OPEN") throw new AppError("INVALID_TRANSITION", "DSR already processed.");

  const email = request.subjectEmail;
  const phone = request.subjectPhone;

  const contacts = await db.contact.findMany({
    where: {
      OR: [
        ...(email === null ? [] : [{ email: email }]),
        ...(phone === null ? [] : [{ phone: phone }]),
      ],
    },
    include: {
      messages: true,
      replies: true,
      meetings: true,
      enrollments: true,
    },
  });

  const contactIds = contacts.map((c) => c.id);
  const consents = contactIds.length === 0
    ? []
    : await db.consentRecord.findMany({ where: { contactId: { in: contactIds } } });

  const notes = contactIds.length === 0
    ? []
    : await db.note.findMany({ where: { targetType: "Contact", targetId: { in: contactIds } } });

  const bundle = { generatedAt: new Date().toISOString(), request: { email, phone }, contacts, consents, notes };
  const body = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");
  const key = `dsr/export/${id}.json`;
  const file = await putFile({
    key,
    body,
    contentType: "application/json",
    purpose: "DSR_EXPORT",
    uploaderId: actor.userId,
  });

  await withTransaction(async (tx) => {
    await tx.dataSubjectRequest.update({
      where: { id },
      data: {
        status: "COMPLETED",
        fulfilledById: actor.userId,
        fulfilledAt: new Date(),
        exportFileId: file.id,
        resultSummary: { contactCount: contacts.length, consentCount: consents.length, noteCount: notes.length },
      },
    });
    await publishAfterCommit(tx, {
      name: "compliance.dsr.completed",
      actor,
      payload: { requestId: id, type: "EXPORT" },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.dsr.manage",
      targetType: "DataSubjectRequest",
      targetId: id,
      after: { fulfilled: "EXPORT", contactCount: contacts.length },
    });
  });

  const url = await getSignedUrl(key, 15 * 60); // 15-minute window for the requester
  return { url };
}

/** Fulfil a DELETE: anonymise personal fields and re-suppress via a hash. */
export async function fulfilDelete(actor: Actor, id: string): Promise<{ anonymisedContacts: number }> {
  await assertActorCan(actor, "acquisition.dsr.manage");
  if (actor.type !== "USER") throw new AppError("FORBIDDEN", "Only a user can fulfil a DSR.");
  const request = await db.dataSubjectRequest.findUnique({
    where: { id },
    select: { id: true, type: true, subjectEmail: true, subjectPhone: true, status: true },
  });
  if (request === null) throw new AppError("NOT_FOUND", "DSR not found.");
  if (request.type !== "DELETE") throw new AppError("INVALID_TRANSITION", "This DSR is not a DELETE.");
  if (request.status !== "OPEN") throw new AppError("INVALID_TRANSITION", "DSR already processed.");

  const email = request.subjectEmail;
  const phone = request.subjectPhone;
  let anonymised = 0;

  await withTransaction(async (tx) => {
    const contacts = await tx.contact.findMany({
      where: {
        OR: [
          ...(email === null ? [] : [{ email }]),
          ...(phone === null ? [] : [{ phone }]),
        ],
      },
      select: { id: true },
    });
    for (const contact of contacts) {
      await tx.contact.update({
        where: { id: contact.id },
        data: {
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          emailStatus: "UNVERIFIED",
          emailVerifiedAt: null,
          phone: null,
          linkedinUrl: null,
          isAnonymized: true,
          anonymizedAt: new Date(),
        },
      });
      anonymised += 1;
    }
    // Free-text notes about this subject: wipe body.
    if (contacts.length > 0) {
      const contactIds = contacts.map((c) => c.id);
      await tx.note.updateMany({
        where: { targetType: "Contact", targetId: { in: contactIds } },
        data: { body: "[erased for DSR]" },
      });
    }
    await tx.dataSubjectRequest.update({
      where: { id },
      data: {
        status: "COMPLETED",
        fulfilledById: actor.userId,
        fulfilledAt: new Date(),
        resultSummary: { anonymised },
      },
    });
    await publishAfterCommit(tx, {
      name: "compliance.dsr.completed",
      actor,
      payload: { requestId: id, type: "DELETE" },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.dsr.manage",
      targetType: "DataSubjectRequest",
      targetId: id,
      after: { fulfilled: "DELETE", anonymised },
    });
  });

  // Re-suppress via a hash outside the transaction (the suppression path has its own tx).
  if (email !== null) {
    const canonical = normalizeSuppressionValue("EMAIL", email);
    if (canonical !== null) {
      await addSuppression(actor, {
        type: "EMAIL",
        value: hashSuppressionValue(canonical),
        reason: "DSR_DELETE",
        source: "DSR",
        hashed: true,
      });
    }
  }
  if (phone !== null) {
    const canonical = normalizeSuppressionValue("PHONE", phone);
    if (canonical !== null) {
      await addSuppression(actor, {
        type: "PHONE",
        value: hashSuppressionValue(canonical),
        reason: "DSR_DELETE",
        source: "DSR",
        hashed: true,
      });
    }
  }

  return { anonymisedContacts: anonymised };
}
