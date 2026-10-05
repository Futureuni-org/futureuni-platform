/**
 * Workflow subscribers (Phase 19). A new lead starts its advance workflow automatically, so a lead
 * flows from discovery to a review-queue draft with nobody pushing it (docs/contracts/events.md:
 * `lead.created` → 19 `acquisition.lead.advance`). Lazy-imports keep the manifest's codegen graph
 * free of the job runtime.
 */

import type { AnySubscriberDefinition } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

export const advanceOnLeadCreatedSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.advance.on-lead-created",
  events: ["lead.created"],
  mode: "job",
  handler: async (event) => {
    const { tryStartAdvance } = await import("./start");
    await tryStartAdvance(event.payload.leadId);
  },
});

export const workflowSubscribers: readonly AnySubscriberDefinition[] = [
  advanceOnLeadCreatedSubscriber,
];
