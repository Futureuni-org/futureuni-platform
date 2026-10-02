/**
 * Inbox notification types (Phase 13), matching docs/contracts/events.md §3a. `reply.interested` and
 * `reply.needs-action` are already platform types (`src/platform/notifications/types.ts`) and are
 * routed from `reply.classified` by the Phase 6 notification-router, so they are NOT redeclared here;
 * only the SLA and nurture types below are new. Registered on the acquisition manifest by Phase 19
 * through `phases/13/REQUESTS.md`.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const INBOX_NOTIFICATION_TYPES = {
  slaWarning: "reply.sla-warning",
  slaBreached: "reply.sla-breached",
  nurtureFollowUpDue: "nurture.follow-up-due",
} as const;

export const inboxNotifications: NotificationTypeDefinition[] = [
  {
    id: INBOX_NOTIFICATION_TYPES.slaWarning,
    label: "Reply SLA at 75%",
    description: "A reply is approaching its response deadline.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: false,
  },
  {
    id: INBOX_NOTIFICATION_TYPES.slaBreached,
    label: "Reply SLA breached",
    description: "A reply has passed its response deadline.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: true,
    digestible: false,
  },
  {
    id: INBOX_NOTIFICATION_TYPES.nurtureFollowUpDue,
    label: "Follow-up due",
    description: "A nurtured lead has reached its follow-up date.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
];
