/**
 * Inbox AI tasks (Phase 13). `inbox-classify` (fast) assigns a reply class and extracts follow-up
 * dates, referrals, objections, questions, sentiment and a one-line summary; `inbox-draft-reply`
 * (balanced) drafts a human-sent response citing findings (INV-5). Registered on the acquisition
 * manifest by Phase 19 through `phases/13/REQUESTS.md`.
 *
 * Untrusted content (reply text, thread, finding evidence) reaches the model only inside the
 * delimited data blocks each SKILL.md defines; it is data, never instructions (INV-24).
 */

// `registerTask` from `@/platform/ai/registry` (never the `@/platform/ai` barrel), because the
// manifest imports this file and the barrel boots the registry at load — that would form a
// manifest ↔ registry import cycle (mirrors pipeline/tasks.ts).
import { registerTask } from "@/platform/ai/registry";
import { defineTask } from "@/platform/ai/define";
import type { Market, ServiceLine } from "@/contracts/common";

import { InboxClassifyInputSchema, InboxClassifyOutputSchema } from "./classify/schemas";
import { InboxDraftReplyInputSchema, InboxDraftReplyOutputSchema } from "./draft/schemas";

function lineFile(line: ServiceLine): string {
  return `${line.toLowerCase().replace(/_/g, "-")}.md`;
}
function marketFile(market: Market): string {
  return market === "NIGERIA" ? "nigeria.md" : "international.md";
}
function acquisitionReferences(input: { serviceLine: ServiceLine; market: Market }): {
  path: string;
  optional?: boolean;
}[] {
  return [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ];
}

export const inboxClassifyTask = defineTask({
  id: "acquisition.inbox-classify",
  module: "acquisition",
  description:
    "Classify an inbound reply and extract its follow-up date, referral, objection, questions, sentiment and summary.",
  skillPath: "acquisition/inbox-classify",
  sharedSkills: ["_shared/futureuni-voice"],
  references: acquisitionReferences,
  inputSchema: InboxClassifyInputSchema,
  outputSchema: InboxClassifyOutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 700,
  defaultTemperature: 0,
  vision: false,
  cacheableSystem: true,
  piiPolicy: {
    allowedPersonalFields: [
      "reply.fromName",
      "reply.subject",
      "reply.text",
      "originalMessage.subject",
      "originalMessage.text",
    ],
  },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/acquisition/inbox-classify",
  mockFixture: "evals/acquisition/inbox-classify/fixtures/default.json",
});

export const inboxDraftReplyTask = defineTask({
  id: "acquisition.inbox-draft-reply",
  module: "acquisition",
  description:
    "Draft a short, honest reply to a prospect that answers their questions and cites findings, for a human to send.",
  skillPath: "acquisition/inbox-draft-reply",
  sharedSkills: ["_shared/futureuni-voice"],
  references: acquisitionReferences,
  inputSchema: InboxDraftReplyInputSchema,
  outputSchema: InboxDraftReplyOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_100,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: {
    allowedPersonalFields: ["ownerName", "leadBrief", "objectionSummary", "thread.text", "thread.subject"],
  },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/inbox-draft-reply",
  mockFixture: "evals/acquisition/inbox-draft-reply/fixtures/default.json",
});

export const inboxAiTasks = [inboxClassifyTask, inboxDraftReplyTask] as const;

/**
 * Registers the inbox tasks directly for tests and evals (mirrors Phase 12/14), before Phase 19
 * wires them onto the acquisition manifest. Idempotent so repeated calls across a test suite are safe.
 */
let registered = false;
export function ensureInboxTasksRegistered(): void {
  if (registered) return;
  for (const task of inboxAiTasks) registerTask(task);
  registered = true;
}
