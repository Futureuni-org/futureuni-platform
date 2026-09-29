import "server-only";

import type { JobResult } from "@/contracts/jobs";
import { db } from "@/platform/db";
import { getSetting } from "@/platform/settings";

/**
 * Groups each user's unread, digestible notifications from the last 24 hours and enqueues one
 * email per user. The real email is sent by `platform.send-email`. The types themselves declare
 * digestibility (`docs/contracts/events.md` §3a).
 */
export async function runNotificationsDigest(): Promise<JobResult> {
  const enabled = await getSetting<boolean>("notifications.digest.enabled");
  if (!enabled) return { counts: { skipped: 1 } };

  const { getNotificationTypes } = await import("@/platform/registry");
  const digestibleTypes = new Set(
    getNotificationTypes()
      .filter((t) => t.digestible)
      .map((t) => t.id),
  );

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notifications = await db.notification.findMany({
    where: { readAt: null, createdAt: { gte: cutoff }, type: { in: [...digestibleTypes] } },
    select: { id: true, userId: true, type: true, title: true, link: true },
  });

  const byUser = new Map<string, typeof notifications>();
  for (const notification of notifications) {
    const list = byUser.get(notification.userId) ?? [];
    list.push(notification);
    byUser.set(notification.userId, list);
  }

  const { sendEmail } = await import("@/platform/notifications");
  let enqueued = 0;
  for (const [userId, items] of byUser) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user === null) continue;
    await sendEmail({
      to: user.email,
      template: "daily-digest",
      props: { name: user.name, count: items.length, items: items.map((n) => ({ title: n.title, link: n.link })) },
      dedupeKey: `digest:${userId}:${new Date().toISOString().slice(0, 10)}`,
    });
    enqueued += 1;
  }
  return { counts: { users: byUser.size, emails: enqueued } };
}
