/**
 * `notify(...)` — the one entry point for creating a notification (`docs/specs/platform.md` §3.6).
 *
 * - Resolves recipients from `userIds`, `role`, or `serviceLine`.
 * - Respects each user's `NotificationPreference`; a **critical** type ignores mute.
 * - Deduplicates on `(userId, dedupeKey)` within the window (defaults to indefinitely, since the
 *   unique index on `(userId, dedupeKey)` never allows a second row with the same key).
 * - Enqueues an email through `platform.send-email` when the type's channels include EMAIL.
 */

import "server-only";

import type { Role, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db, isUniqueViolation, Prisma, toJsonInput } from "@/platform/db";

import { getNotificationType } from "./registry";
import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

type Channel = "IN_APP" | "EMAIL";

export interface NotifyInput {
  userIds?: string[];
  role?: Role;
  serviceLine?: ServiceLine;
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
  channels?: Channel[];
  dedupeKey?: string;
}

export interface NotifyResult {
  createdIds: string[];
  emailedUserIds: string[];
  skippedUserIds: string[];
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const type = getNotificationType(input.type);
  if (type === null) {
    throw new AppError("VALIDATION_FAILED", `Unknown notification type: ${input.type}`);
  }
  const recipients = await resolveRecipients(input);
  if (recipients.length === 0) {
    return { createdIds: [], emailedUserIds: [], skippedUserIds: [] };
  }
  const channels = input.channels ?? type.defaultChannels;
  const createdIds: string[] = [];
  const emailedUserIds: string[] = [];
  const skippedUserIds: string[] = [];

  for (const userId of recipients) {
    const preferences = await preferencesFor(userId, type);
    const wantsInApp = channels.includes("IN_APP") && (type.critical || preferences.IN_APP);
    const wantsEmail = channels.includes("EMAIL") && (type.critical || preferences.EMAIL);

    let created: { id: string } | null = null;
    if (wantsInApp) {
      created = await createInApp(userId, input, type);
      if (created !== null) createdIds.push(created.id);
    }
    if (wantsEmail) {
      await enqueueEmail(userId, input, type);
      emailedUserIds.push(userId);
    }
    if (!wantsInApp && !wantsEmail) skippedUserIds.push(userId);
  }
  return { createdIds, emailedUserIds, skippedUserIds };
}

async function resolveRecipients(input: NotifyInput): Promise<string[]> {
  const ids = new Set<string>();
  if (input.userIds !== undefined) for (const id of input.userIds) ids.add(id);
  if (input.role !== undefined) {
    const users = await db.user.findMany({ where: { role: input.role, status: "ACTIVE" }, select: { id: true } });
    for (const u of users) ids.add(u.id);
  }
  if (input.serviceLine !== undefined) {
    const profiles = await db.teamProfile.findMany({
      where: { serviceLines: { has: input.serviceLine }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    for (const p of profiles) ids.add(p.userId);
  }
  return [...ids];
}

async function preferencesFor(userId: string, type: NotificationTypeDefinition): Promise<Record<Channel, boolean>> {
  const rows = await db.notificationPreference.findMany({
    where: { userId, type: type.id },
    select: { channel: true, enabled: true },
  });
  const defaults: Record<Channel, boolean> = {
    IN_APP: type.defaultChannels.includes("IN_APP"),
    EMAIL: type.defaultChannels.includes("EMAIL"),
  };
  for (const row of rows) defaults[row.channel] = row.enabled;
  return defaults;
}

async function createInApp(
  userId: string,
  input: NotifyInput,
  type: NotificationTypeDefinition,
): Promise<{ id: string } | null> {
  try {
    const row = await db.notification.create({
      data: {
        userId,
        type: type.id,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        data: input.data === undefined ? Prisma.JsonNull : toJsonInput(input.data),
        dedupeKey: input.dedupeKey ?? null,
      },
      select: { id: true },
    });
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) return null; // dedupe hit
    throw error;
  }
}

async function enqueueEmail(userId: string, input: NotifyInput, type: NotificationTypeDefinition): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user === null) return;
  const { enqueueJob } = await import("@/platform/jobs/enqueue");
  const dedupe = input.dedupeKey ?? `${type.id}:${userId}:${Date.now().toString(36)}`;
  await enqueueJob(
    "platform.send-email",
    {
      to: user.email,
      template: "notification",
      props: { title: input.title, body: input.body ?? "", link: input.link ?? null, type: type.id },
      dedupeKey: `notify:${dedupe}`,
    },
    { actor: { type: "SYSTEM", job: "platform.notifications" } },
  );
}
