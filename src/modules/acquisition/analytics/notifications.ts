/**
 * Analytics notification types (Phase 17). Added to the acquisition manifest and to
 * `docs/contracts/events.md` by Phase 19 through `phases/17/REQUESTS.md`.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const ANALYTICS_NOTIFICATION_TYPES = {
  weeklyReport: "analytics.weekly-report",
} as const;

export const analyticsNotificationTypes: NotificationTypeDefinition[] = [
  {
    id: ANALYTICS_NOTIFICATION_TYPES.weeklyReport,
    label: "Weekly acquisition insight",
    description: "A short Monday summary of what changed across the service lines, with the headline metrics.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: false,
    digestible: false,
  },
];
