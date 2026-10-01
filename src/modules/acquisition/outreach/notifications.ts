/**
 * Outreach notification types (Phase 12). `review.queue-waiting` is already a platform type; only
 * `mailbox.paused` is new here. Registered on the acquisition manifest by Phase 19 through
 * `phases/12/REQUESTS.md`.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const MAILBOX_PAUSED = "mailbox.paused";

export const outreachNotifications: NotificationTypeDefinition[] = [
  {
    id: MAILBOX_PAUSED,
    label: "Mailbox paused",
    description: "An outreach mailbox was paused automatically because its bounce rate was too high.",
    category: "transactional",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: true,
    digestible: false,
  },
];
