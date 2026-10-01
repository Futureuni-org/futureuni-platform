/**
 * Sourcing notification types (Phase 8). Registered on the acquisition manifest by Phase 19 through
 * `phases/08/REQUESTS.md`. The capacity-skip path reuses the platform `capacity.line-full` type
 * (module spec §3.16), so only the run-completed type is new here.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const SOURCING_RUN_COMPLETED = "sourcing.run-completed";

export const sourcingNotificationTypes: NotificationTypeDefinition[] = [
  {
    id: SOURCING_RUN_COMPLETED,
    label: "Search run finished",
    description: "A search run you started, or a saved search you own, has finished.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
];
