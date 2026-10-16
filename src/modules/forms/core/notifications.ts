/**
 * Client Forms notification types (docs/contracts/events.md shape; registered on the module
 * manifest). F1 has one: a brief arrived and somebody should read it.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const FORM_NOTIFICATION_TYPES = {
  submissionReceived: "forms.submission-received",
} as const;

export const formNotificationTypes: NotificationTypeDefinition[] = [
  {
    id: FORM_NOTIFICATION_TYPES.submissionReceived,
    label: "A brief arrived",
    description: "A prospect filled in one of the client forms.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
];
