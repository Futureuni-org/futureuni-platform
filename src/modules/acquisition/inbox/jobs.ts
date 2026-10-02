/**
 * Inbox jobs (Phase 13). Poll pulls replies and enqueues processing; process classifies and actions
 * one reply; sla-check and nurture-reminders run on a schedule. Handlers lazy-import their services
 * so this file stays cheap to import (no AI runtime at load; manifest↔registry cycle avoidance).
 * Registered on the acquisition manifest by Phase 19 through `phases/13/REQUESTS.md`.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

export const inboxPollJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.inbox.poll",
  description: "Poll the outreach mailboxes for new replies, match them to leads, and enqueue processing.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { pollAllMailboxes } = await import("./ingest/ingest");
      const r = await pollAllMailboxes(ctx.clock);
      return {
        counts: { mailboxes: r.mailboxes, fetched: r.fetched, stored: r.stored, unmatched: r.unmatched },
        summary: `fetched ${String(r.fetched)}, stored ${String(r.stored)}`,
      };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.inbox.poll:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
  systemActions: [],
});

export const inboxProcessJob: AnyJobDefinition = defineJob<{ replyId: string }>({
  name: "acquisition.inbox.process",
  description: "Classify one inbound reply and run its class-specific actions (stop, suppress, nurture, draft).",
  input: z.object({ replyId: z.string().min(1) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { processReply } = await import("./actions/process");
      const r = await processReply(input.replyId, ctx.clock);
      return { summary: r.status };
    },
  },
  concurrency: 5,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ replyId }) => `acquisition.inbox.process:${replyId}`,
  allowManualRun: false,
  systemActions: ["acquisition.suppression.add", "acquisition.message.draft"],
});

export const inboxSlaCheckJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.inbox.sla-check",
  description: "Warn owners at 75% of the reply SLA and escalate breaches to owners and managers.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { runSlaCheck } = await import("./routing/sla-check");
      const r = await runSlaCheck(ctx.clock);
      return { counts: { checked: r.checked, warned: r.warned, breached: r.breached }, summary: `warned ${String(r.warned)}, breached ${String(r.breached)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 30_000 },
  idempotencyKey: () => `acquisition.inbox.sla-check:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
  systemActions: [],
});

export const inboxNurtureRemindersJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.inbox.nurture-reminders",
  description: "Notify owners of NOT_NOW leads whose follow-up date has arrived.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { runNurtureReminders } = await import("./actions/nurture");
      const r = await runNurtureReminders(ctx.clock);
      return { counts: { due: r.due, notified: r.notified }, summary: `notified ${String(r.notified)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 30_000 },
  idempotencyKey: () => `acquisition.inbox.nurture-reminders:${new Date().toISOString().slice(0, 10)}`,
  allowManualRun: true,
  systemActions: [],
});

export const inboxJobs: readonly AnyJobDefinition[] = [
  inboxPollJob,
  inboxProcessJob,
  inboxSlaCheckJob,
  inboxNurtureRemindersJob,
];
