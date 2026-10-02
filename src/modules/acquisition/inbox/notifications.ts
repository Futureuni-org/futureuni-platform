/**
 * Inbox notification types (Phase 13), matching docs/contracts/events.md §3a. Registered on the
 * acquisition manifest by Phase 19 through `phases/13/REQUESTS.md`.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const INBOX_NOTIFICATION_TYPES = {
  interested: "reply.interested",
  needsAction: "reply.needs-action",
  slaWarning: "reply.sla-warning",
  slaBreached: "reply.sla-breached",
  nurtureFollowUpDue: "nurture.follow-up-due",
} as const;

export const inboxNotifications: NotificationTypeDefinition[] = [
  {
    id: INBOX_NOTIFICATION_TYPES.interested,
    label: "Interested reply",
    description: "A prospect replied with interest and needs a prompt response.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: true,
    digestible: false,
  },
  {
    id: INBOX_NOTIFICATION_TYPES.needsAction,
    label: "Reply needs action",
    description: "A prospect reply (a question, objection or unclear message) needs a human response.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: false,
    digestible: false,
  },
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
