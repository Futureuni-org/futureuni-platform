/**
 * Pipeline jobs (Phase 14). Registered on the acquisition manifest by Phase 19 through
 * `phases/14/REQUESTS.md`. Heavy services are imported lazily inside handlers so importing this
 * leaf file (as the manifest does) never boots the AI registry or the PDF renderer.
 *
 * Every handler takes its clock from the job context (B4): `now = () => ctx.clock.now()`.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

const EmptyInput = z.object({}).default({});

function daySlot(now: Date): string {
  return now.toISOString().slice(0, 10);
}
function quarterHourSlot(now: Date): string {
  return `${now.toISOString().slice(0, 13)}:${String(Math.floor(now.getMinutes() / 15))}`;
}

export const precallBriefJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.pipeline.precall-brief",
  description: "Generate pre-call briefs for meetings within the lead-time window that have none.",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { generateDuePrecallBriefs } = await import("./meetings/meetings");
      const result = await generateDuePrecallBriefs(ctx.clock.now());
      return { counts: { generated: result.generated }, summary: `generated ${String(result.generated)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.pipeline.precall-brief:${quarterHourSlot(new Date())}`,
  allowManualRun: true,
});

export const meetingRemindersJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.pipeline.meeting-reminders",
  description: "Send owner meeting reminders 24h and 1h before (settings).",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { sendDueMeetingReminders } = await import("./meetings/meetings");
      const result = await sendDueMeetingReminders(ctx.clock.now());
      return { counts: { sent: result.sent }, summary: `sent ${String(result.sent)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.pipeline.meeting-reminders:${quarterHourSlot(new Date())}`,
  allowManualRun: true,
});

export const staleCheckJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.pipeline.stale-check",
  description: "Flag leads with no activity beyond their stage's threshold and notify owners.",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { runStaleCheck } = await import("./board/board");
      const result = await runStaleCheck(ctx.clock.now());
      return { counts: { flagged: result.flagged }, summary: `flagged ${String(result.flagged)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.pipeline.stale-check:${daySlot(new Date())}`,
  allowManualRun: true,
});

export const proposalExpiryJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.pipeline.proposal-expiry",
  description: "Expire sent proposals past their validity and set a follow-up next action.",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { expireProposals } = await import("./proposals/proposals");
      const result = await expireProposals(ctx.clock.now());
      return { counts: { expired: result.expired }, summary: `expired ${String(result.expired)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.pipeline.proposal-expiry:${daySlot(new Date())}`,
  allowManualRun: true,
});

export const reengageJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.pipeline.reengage",
  description: "Move lost leads whose re-engagement date has arrived to NURTURE and notify owners.",
  input: EmptyInput,
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { releaseDueReengagements } = await import("./deals/deals");
      const result = await releaseDueReengagements(ctx.clock.now());
      return { counts: { released: result.released }, summary: `released ${String(result.released)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.pipeline.reengage:${daySlot(new Date())}`,
  allowManualRun: true,
});

export const pipelineJobs: readonly AnyJobDefinition[] = [
  precallBriefJob,
  meetingRemindersJob,
  staleCheckJob,
  proposalExpiryJob,
  reengageJob,
];
