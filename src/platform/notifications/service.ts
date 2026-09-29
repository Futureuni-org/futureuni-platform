/**
 * In-app notification services (`docs/specs/platform.md` §3.6 API).
 *
 * SEAM-NOTIFICATIONS-SHELL wires `listForUser`, `unreadCount` and `markRead` into the app shell's
 * notification bell.
 */

import "server-only";

import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

import { getNotificationType, listNotificationTypes } from "./registry";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
  data: unknown;
}

export interface ListOptions {
  unreadOnly?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listForUser(userId: string, opts: ListOptions = {}): Promise<{ items: NotificationItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 50);
  const rows = await db.notification.findMany({
    where: {
      userId,
      ...(opts.unreadOnly === true ? { readAt: null } : {}),
      ...(opts.cursor === undefined ? {} : { createdAt: { lt: new Date(opts.cursor) } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true, data: true },
  });
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last !== undefined ? last.createdAt.toISOString() : null,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, target: readonly string[] | "all"): Promise<{ updated: number }> {
  if (target === "all") {
    const { count } = await db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
  const { count } = await db.notification.updateMany({
    where: { userId, id: { in: [...target] }, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

// ---- Preferences ----

type Channel = "IN_APP" | "EMAIL";

export type UserPreferences = Record<string, { IN_APP: boolean; EMAIL: boolean; critical: boolean }>;

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const rows = await db.notificationPreference.findMany({
    where: { userId },
    select: { type: true, channel: true, enabled: true },
  });
  const overrides = new Map<string, Partial<Record<Channel, boolean>>>();
  for (const row of rows) {
    const record = overrides.get(row.type) ?? {};
    record[row.channel] = row.enabled;
    overrides.set(row.type, record);
  }
  const result: UserPreferences = {};
  for (const type of listNotificationTypes()) {
    const override = overrides.get(type.id) ?? {};
    result[type.id] = {
      IN_APP: override.IN_APP ?? type.defaultChannels.includes("IN_APP"),
      EMAIL: override.EMAIL ?? type.defaultChannels.includes("EMAIL"),
      critical: type.critical,
    };
  }
  return result;
}

export interface PreferenceUpdate {
  type: string;
  channel: Channel;
  enabled: boolean;
}

export async function updatePreferences(userId: string, updates: readonly PreferenceUpdate[]): Promise<void> {
  for (const update of updates) {
    const type = getNotificationType(update.type);
    if (type === null) throw new AppError("VALIDATION_FAILED", `Unknown notification type: ${update.type}`);
    if (type.critical && !update.enabled) {
      throw new AppError("VALIDATION_FAILED", `Critical type "${type.id}" can't be muted.`);
    }
    await db.notificationPreference.upsert({
      where: { userId_type_channel: { userId, type: update.type, channel: update.channel } },
      create: { userId, type: update.type, channel: update.channel, enabled: update.enabled },
      update: { enabled: update.enabled },
    });
  }
}
