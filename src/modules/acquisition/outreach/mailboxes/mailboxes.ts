import "server-only";

/**
 * Mailbox and sending-domain services (step 4.2). Mutations check permission and are audited; the
 * credentials vault key is always `outreach-mailbox:<mailboxId>` (INV-21). `listActiveMailboxes` is
 * the provided seam SEAM-MAILBOXES consumed by Phase 13.
 */

import type { Actor } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { isUniqueViolation, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";

import { getOutreachSetting } from "../settings";
import {
  createMailbox,
  findMailbox,
  findSendingDomainByName,
  listSendableMailboxes,
  recentHardBounceRate,
  updateMailbox as updateMailboxRow,
} from "./mailbox.repo";

export interface AddMailboxInput {
  address: string;
  displayName: string;
  sendingDomain: string;
  provider: "gmail-api" | "smtp" | "mock";
  senderUserId?: string;
}

/** Creates a mailbox in WARMING with warm-up defaults from settings. ADMIN only. */
export async function addMailbox(actor: Actor, input: AddMailboxInput): Promise<{ id: string; credentialProvider: string }> {
  await assertActorCan(actor, "acquisition.mailbox.manage");

  return withTransaction(async (tx) => {
    const domain = await ensureSendingDomain(tx, input.sendingDomain, input.provider);
    const mailbox = await createMailbox(tx, {
      address: input.address,
      displayName: input.displayName,
      sendingDomainId: domain.id,
      provider: input.provider,
      credentialProvider: "outreach-mailbox:pending",
      status: "WARMING",
      warmupStartDate: new Date(),
      warmupStartCap: await getOutreachSetting("warmupStartCap"),
      dailyCapTarget: await getOutreachSetting("dailyCapTarget"),
      warmupRampDays: await getOutreachSetting("warmupRampDays"),
      ...(input.senderUserId === undefined ? {} : { senderUserId: input.senderUserId }),
    }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw new AppError("CONFLICT", "A mailbox with that address already exists.");
      throw error;
    });

    const credentialProvider = `outreach-mailbox:${mailbox.id}`;
    await updateMailboxRow(tx, mailbox.id, { credentialProvider });
    await audit.record(tx, {
      actor,
      action: "acquisition.mailbox.manage",
      targetType: "Mailbox",
      targetId: mailbox.id,
      after: { address: input.address, provider: input.provider, status: "WARMING" },
    });
    return { id: mailbox.id, credentialProvider };
  });
}

async function ensureSendingDomain(tx: Tx, domain: string, provider: string): Promise<{ id: string }> {
  const existing = await findSendingDomainByName(tx, domain);
  if (existing !== null) return existing;
  return tx.sendingDomain.create({
    data: { domain, provider: provider === "gmail-api" ? "google-workspace" : provider },
    select: { id: true },
  });
}

export interface UpdateMailboxInput {
  displayName?: string;
  dailyCapTarget?: number;
  warmupRampDays?: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  status?: "WARMING" | "ACTIVE" | "PAUSED" | "DISABLED";
}

export async function updateMailbox(actor: Actor, id: string, patch: UpdateMailboxInput): Promise<void> {
  await assertActorCan(actor, "acquisition.mailbox.manage");
  await withTransaction(async (tx) => {
    const current = await findMailbox(tx, id);
    if (current === null) throw new AppError("NOT_FOUND", "Mailbox not found.");
    await updateMailboxRow(tx, id, patch);
    await audit.record(tx, {
      actor,
      action: "acquisition.mailbox.manage",
      targetType: "Mailbox",
      targetId: id,
      before: { status: current.status, dailyCapTarget: current.dailyCapTarget },
      after: patch,
    });
  });
}

/**
 * Pauses a mailbox and emits `mailbox.paused`. Callable by an admin (USER actor) or by the health
 * check (SYSTEM actor). Idempotent: pausing an already-paused mailbox only updates the reason.
 */
export async function pauseMailbox(actor: Actor, id: string, reason: string): Promise<void> {
  await withTransaction(async (tx) => {
    const current = await findMailbox(tx, id);
    if (current === null) throw new AppError("NOT_FOUND", "Mailbox not found.");
    await updateMailboxRow(tx, id, { status: "PAUSED", pausedReason: reason });
    await audit.record(tx, {
      actor,
      action: "acquisition.mailbox.manage",
      targetType: "Mailbox",
      targetId: id,
      after: { status: "PAUSED", pausedReason: reason },
    });
    await publishAfterCommit(tx, {
      name: "mailbox.paused",
      actor,
      payload: { mailboxId: id, reason },
    });
  });
}

export interface ActiveMailbox {
  id: string;
  address: string;
  provider: string;
  credentialProvider: string;
}

/** Provided seam SEAM-MAILBOXES: the sendable mailboxes (Phase 13 polls these for replies). */
export async function listActiveMailboxes(): Promise<ActiveMailbox[]> {
  const rows = await listSendableMailboxes(null);
  return rows.map((m) => ({ id: m.id, address: m.address, provider: m.provider, credentialProvider: m.credentialProvider }));
}

export interface MailboxHealth {
  id: string;
  status: string;
  hardBounceRate: number | null;
  sampled: number;
  threshold: number;
}

export async function getMailboxHealth(actor: Actor, id: string): Promise<MailboxHealth> {
  await assertActorCan(actor, "acquisition.mailbox.read");
  const mailbox = await findMailbox(null, id);
  if (mailbox === null) throw new AppError("NOT_FOUND", "Mailbox not found.");
  const sampleSize = await getOutreachSetting("healthSampleSize");
  const recent = await recentHardBounceRate(null, id, sampleSize);
  return {
    id,
    status: mailbox.status,
    hardBounceRate: recent?.rate ?? null,
    sampled: recent?.sampled ?? 0,
    threshold: await getOutreachSetting("bounceRatePauseThreshold"),
  };
}
