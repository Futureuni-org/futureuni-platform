/**
 * Compliance subscribers (Phase 9). The `settings.changed` subscriber enqueues a reevaluate job
 * whenever the Nigerian direct-marketing basis changes (`docs/contracts/events.md` §3 table).
 */

import type { AnySubscriberDefinition } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

export const settingsChangedSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.compliance.settings-changed",
  events: ["settings.changed"],
  mode: "job",
  handler: async (event) => {
    if (event.payload.key !== "acquisition.compliance.ngDirectMarketingBasis") return;
    const { enqueueJob } = await import("@/platform/jobs");
    await enqueueJob(
      "acquisition.compliance.reevaluate",
      {},
      { actor: { type: "SYSTEM", job: "acquisition.compliance.settings-changed" } },
    );
  },
});

export const complianceSubscribers: readonly AnySubscriberDefinition[] = [settingsChangedSubscriber];
