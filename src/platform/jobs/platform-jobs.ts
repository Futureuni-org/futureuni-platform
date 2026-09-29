/**
 * Platform-owned jobs (Phase 6). These are registered on `core-manifest.ts` by the Wave 1
 * integration (see `phases/06/REQUESTS.md`); until then the runtime registry picks them up
 * through `listAllJobs()`.
 */

import "server-only";

import { z } from "zod";

import type { AnyJobDefinition, CronSchedule } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";
import { db } from "@/platform/db";

// ---- platform.send-email ------------------------------------------------------------------

const sendEmailInput = z.object({
  to: z.string().min(3),
  template: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  dedupeKey: z.string().min(1),
});

export const sendEmailJob: AnyJobDefinition = defineJob<z.infer<typeof sendEmailInput>>({
  name: "platform.send-email",
  description: "Send one platform (transactional) email via the configured provider.",
  input: sendEmailInput,
  handler: {
    kind: "single",
    run: async (input) => {
      const { deliverPlatformEmail } = await import("@/platform/notifications/email/send-job");
      return deliverPlatformEmail(input);
    },
  },
  concurrency: 5,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ dedupeKey }) => `platform.send-email:${dedupeKey}`,
  notifyOnFailure: false,
});

// ---- platform.deliver-event ---------------------------------------------------------------

const deliverEventInput = z.object({
  eventId: z.string().min(1),
  subscriberId: z.string().min(1),
});

export const deliverEventJob: AnyJobDefinition = defineJob<z.infer<typeof deliverEventInput>>({
  name: "platform.deliver-event",
  description: "Deliver one domain event to one subscriber (job-mode).",
  input: deliverEventInput,
  handler: {
    kind: "single",
    run: async (input) => {
      const { deliverToSubscriber } = await import("@/platform/events");
      await deliverToSubscriber(input.eventId, input.subscriberId);
      return { counts: { delivered: 1 } };
    },
  },
  concurrency: 20,
  timeoutMs: 60_000,
  retry: { maxAttempts: 5, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 120_000 },
  idempotencyKey: ({ eventId, subscriberId }) => `platform.deliver-event:${eventId}:${subscriberId}`,
  notifyOnFailure: false,
});

// ---- platform.job-runs-cleanup ------------------------------------------------------------

const cleanupInput = z.object({ retentionDays: z.int().min(1).max(365).default(30) });

export const jobRunsCleanupJob: AnyJobDefinition = defineJob<z.infer<typeof cleanupInput>>({
  name: "platform.job-runs-cleanup",
  description: "Prune succeeded JobRun rows older than the retention setting.",
  input: cleanupInput,
  handler: {
    kind: "single",
    run: async ({ retentionDays }) => {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const { count } = await db.jobRun.deleteMany({
        where: { status: "SUCCEEDED", finishedAt: { lt: cutoff } },
      });
      return { counts: { deleted: count } };
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: ({ retentionDays }) => `platform.job-runs-cleanup:${String(retentionDays)}`,
  allowManualRun: true,
});

// ---- platform.retention-purge -------------------------------------------------------------

export const retentionPurgeJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "platform.retention-purge",
  description: "Purge platform-owned data (AI call content, expired files, audit log if set).",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async () => {
      const { runRetentionPurge } = await import("./platform-jobs/retention-purge");
      return runRetentionPurge();
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "fixed", initialDelayMs: 10_000, maxDelayMs: 60_000 },
  idempotencyKey: () => "platform.retention-purge:daily",
  allowManualRun: true,
});

// ---- platform.credentials-health ----------------------------------------------------------

export const credentialsHealthJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "platform.credentials-health",
  description: "Test every configured integration and emit `integration.failing` on failure.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async () => {
      const { runCredentialsHealth } = await import("./platform-jobs/credentials-health");
      return runCredentialsHealth();
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "fixed", initialDelayMs: 10_000, maxDelayMs: 60_000 },
  idempotencyKey: () => "platform.credentials-health:daily",
  allowManualRun: true,
});

// ---- platform.notifications-digest --------------------------------------------------------

export const notificationsDigestJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "platform.notifications-digest",
  description: "Email each user a daily digest of their unread digestible notifications.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async () => {
      const { runNotificationsDigest } = await import("./platform-jobs/notifications-digest");
      return runNotificationsDigest();
    },
  },
  concurrency: 1,
  timeoutMs: 300_000,
  retry: { maxAttempts: 2, backoff: "fixed", initialDelayMs: 10_000, maxDelayMs: 60_000 },
  idempotencyKey: () => "platform.notifications-digest:daily",
  allowManualRun: true,
});

export const platformJobs: readonly AnyJobDefinition[] = [
  sendEmailJob,
  deliverEventJob,
  jobRunsCleanupJob,
  retentionPurgeJob,
  credentialsHealthJob,
  notificationsDigestJob,
];

/** Static schedules for the platform jobs. Times are in Africa/Lagos by default. */
export const platformSchedules: readonly CronSchedule[] = [
  { id: "job-runs-cleanup", job: "platform.job-runs-cleanup", cron: "0 2 * * *", timezone: "Africa/Lagos" },
  { id: "retention-purge", job: "platform.retention-purge", cron: "0 3 * * *", timezone: "Africa/Lagos" },
  { id: "credentials-health", job: "platform.credentials-health", cron: "0 6 * * *", timezone: "Africa/Lagos" },
  { id: "notifications-digest", job: "platform.notifications-digest", cron: "0 8 * * *", timezone: "Africa/Lagos" },
];
