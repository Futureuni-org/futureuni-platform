/**
 * Outreach AI tasks (Phase 12). Registered on the acquisition manifest by Phase 19 through
 * `phases/12/REQUESTS.md`. Both run at the balanced tier. Citation enforcement (INV-5) runs in
 * `draft.ts` after generation rather than via the task's `claims` policy, so the mock fixture can
 * carry citation sentinels that are rewritten to the lead's real finding ids.
 *
 * Untrusted content (finding evidence, previous messages) reaches the model only inside the
 * delimited data block the SKILL.md defines; it is data, never instructions (INV-24).
 */

import { defineTask } from "@/platform/ai/define";
import type { Market, ServiceLine } from "@/contracts/common";

import {
  OutreachDraftEditInputSchema,
  OutreachDraftEditOutputSchema,
  OutreachDraftInputSchema,
  OutreachDraftOutputSchema,
} from "./schemas";

function lineFile(line: ServiceLine): string {
  return `${line.toLowerCase().replace(/_/g, "-")}.md`;
}
function marketFile(market: Market): string {
  return market === "NIGERIA" ? "nigeria.md" : "international.md";
}
function draftReferences(input: { serviceLine: ServiceLine; market: Market }): {
  path: string;
  optional?: boolean;
}[] {
  return [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ];
}

export const outreachDraftTask = defineTask({
  id: "acquisition.outreach-draft",
  module: "acquisition",
  description:
    "Write one outreach message from the lead's findings, the pitch angle and the sequence step, citing every claim.",
  skillPath: "acquisition/outreach-draft",
  sharedSkills: ["_shared/futureuni-voice"],
  references: draftReferences,
  inputSchema: OutreachDraftInputSchema,
  outputSchema: OutreachDraftOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 900,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["contact.firstName"] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/outreach-draft",
  mockFixture: "evals/acquisition/outreach-draft/fixtures/default.json",
});

export const outreachDraftEditTask = defineTask({
  id: "acquisition.outreach-draft-edit",
  module: "acquisition",
  description: "Apply a short human style instruction to an outreach draft, keeping every cited claim intact.",
  skillPath: "acquisition/outreach-draft-edit",
  sharedSkills: ["_shared/futureuni-voice"],
  inputSchema: OutreachDraftEditInputSchema,
  outputSchema: OutreachDraftEditOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 700,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  streaming: true,
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/outreach-draft-edit",
  mockFixture: "evals/acquisition/outreach-draft-edit/fixtures/default.json",
});

export const outreachAiTasks = [outreachDraftTask, outreachDraftEditTask] as const;
