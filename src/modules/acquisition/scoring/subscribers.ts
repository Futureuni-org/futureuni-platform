/**
 * Scoring subscribers (phase-11 Step 2 and Step 5). Re-score pre-contact leads when their audit,
 * compliance verdict or signals change, and detect cross-sell when a lead is scored. Each one just
 * enqueues the relevant job (mode "job"), lazy-importing `enqueueJob` to avoid the manifest cycle.
 */

import type { AnySubscriberDefinition } from "@/contracts/events";
import { defineSubscriber } from "@/platform/registry/define";

function systemActor(subscriberId: string): { type: "SYSTEM"; job: string } {
  return { type: "SYSTEM", job: subscriberId };
}

export const rescoreOnAuditSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.scoring.rescore-on-audit",
  events: ["audit.completed"],
  mode: "job",
  handler: async (event) => {
    const { enqueueJob } = await import("@/platform/jobs");
    await enqueueJob(
      "acquisition.scoring.lead",
      { leadId: event.payload.leadId },
      { actor: systemActor("acquisition.scoring.rescore-on-audit") },
    );
  },
});

export const rescoreOnComplianceSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.scoring.rescore-on-compliance",
  events: ["compliance.verdict.changed"],
  mode: "job",
  handler: async (event) => {
    if (event.payload.leadId === null) return;
    const { enqueueJob } = await import("@/platform/jobs");
    await enqueueJob(
      "acquisition.scoring.lead",
      { leadId: event.payload.leadId },
      { actor: systemActor("acquisition.scoring.rescore-on-compliance") },
    );
  },
});

export const rescoreOnSignalSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.scoring.rescore-on-signal",
  events: ["signal.recorded"],
  mode: "job",
  handler: async (event) => {
    if (event.payload.leadId === null) return;
    const { enqueueJob } = await import("@/platform/jobs");
    await enqueueJob(
      "acquisition.scoring.lead",
      { leadId: event.payload.leadId },
      { actor: systemActor("acquisition.scoring.rescore-on-signal") },
    );
  },
});

export const crossSellOnScoredSubscriber: AnySubscriberDefinition = defineSubscriber({
  id: "acquisition.scoring.crosssell-on-scored",
  events: ["lead.scored"],
  mode: "job",
  handler: async (event) => {
    const { enqueueJob } = await import("@/platform/jobs");
    await enqueueJob(
      "acquisition.crosssell.detect",
      { leadId: event.payload.leadId },
      { actor: systemActor("acquisition.scoring.crosssell-on-scored") },
    );
  },
});

export const scoringSubscribers: readonly AnySubscriberDefinition[] = [
  rescoreOnAuditSubscriber,
  rescoreOnComplianceSubscriber,
  rescoreOnSignalSubscriber,
  crossSellOnScoredSubscriber,
];
