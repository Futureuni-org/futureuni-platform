/**
 * Workflow notification types (Phase 19). `lead.needs-attention` is raised by the notification
 * router on the `lead.needsAttention` event, which the advance sweeper publishes once a stuck lead
 * has exhausted its restarts (docs/contracts/events.md §3a).
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const WORKFLOW_NOTIFICATION_TYPES = {
  leadNeedsAttention: "lead.needs-attention",
} as const;

export const workflowNotifications: NotificationTypeDefinition[] = [
  {
    id: WORKFLOW_NOTIFICATION_TYPES.leadNeedsAttention,
    label: "Lead needs attention",
    description: "A lead stalled in the pipeline and the automatic sweeper could not move it on.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: false,
  },
];
