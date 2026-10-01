/**
 * Scoring notification types (phase-11 Steps 5 and 6). Registered on the acquisition manifest by
 * Phase 19 through `phases/11/REQUESTS.md`. `capacity.line-full` already exists platform-side (the
 * notification router raises it on `capacity.mode.changed`), so only these two are new here.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const SCORING_NOTIFICATION_TYPES = {
  crossSellDetected: "crosssell.detected",
  capacityReleased: "capacity.line-released",
} as const;

export const scoringNotificationTypes: NotificationTypeDefinition[] = [
  {
    id: SCORING_NOTIFICATION_TYPES.crossSellDetected,
    label: "Cross-sell opportunity",
    description: "A company now qualifies across more than one service line; outreach will lead with one line.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
  {
    id: SCORING_NOTIFICATION_TYPES.capacityReleased,
    label: "Line capacity freed",
    description: "A line left capacity pause and some held leads were released back to the pipeline.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
];
