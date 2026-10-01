/**
 * Outreach jobs (Phase 12). Registered on the acquisition manifest by Phase 19 through
 * `phases/12/REQUESTS.md`. The tick advances sequences and dispatches due sends; the send job sends
 * one message (production retry/backoff); mailbox-health and dns-check run on a schedule.
 */

import { z } from "zod";

import type { AnyJobDefinition } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

export const outreachTickJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.outreach.tick",
  description: "Advance due outreach enrolments, draft their next steps, and dispatch scheduled sends.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { runOutreachTick } = await import("./sequences/tick");
      const r = await runOutreachTick(ctx.clock.now());
      return {
        counts: { advanced: r.advanced, drafted: r.drafted, stopped: r.stopped, sent: r.sent, resumed: r.resumed },
        summary: `advanced ${String(r.advanced)}, sent ${String(r.sent)}`,
      };
    },
  },
  concurrency: 1,
  timeoutMs: 120_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 60_000 },
  idempotencyKey: () => `acquisition.outreach.tick:${new Date().toISOString().slice(0, 16)}`,
  allowManualRun: true,
  systemActions: [],
});

export const outreachSendJob: AnyJobDefinition = defineJob<{ messageId: string }>({
  name: "acquisition.outreach.send",
  description: "Send one outreach email through the single send path (retry/backoff on provider errors).",
  input: z.object({ messageId: z.string().min(1) }),
  handler: {
    kind: "single",
    run: async (input, ctx) => {
      const { sendEmailMessage } = await import("./email/send");
      const outcome = await sendEmailMessage(input.messageId, { now: ctx.clock.now() });
      return { summary: outcome.status };
    },
  },
  concurrency: 3,
  timeoutMs: 60_000,
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 120_000 },
  idempotencyKey: ({ messageId }) => `acquisition.outreach.send:${messageId}`,
  allowManualRun: false,
  systemActions: [],
});

export const outreachMailboxHealthJob: AnyJobDefinition = defineJob<Record<string, never>>({
  name: "acquisition.outreach.mailbox-health",
  description: "Evaluate every mailbox's hard-bounce rate and auto-pause unhealthy ones.",
  input: z.object({}).strict(),
  handler: {
    kind: "single",
    run: async (_input, ctx) => {
      const { evaluateAllMailboxHealth } = await import("./mailboxes/health");
      const r = await evaluateAllMailboxHealth(ctx.clock.now());
      return { counts: { checked: r.checked, paused: r.paused }, summary: `checked ${String(r.checked)}, paused ${String(r.paused)}` };
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 30_000 },
  idempotencyKey: () => `acquisition.outreach.mailbox-health:${new Date().toISOString().slice(0, 13)}`,
  allowManualRun: true,
  systemActions: [],
});

export const outreachDnsCheckJob: AnyJobDefinition = defineJob<{ domain: string }>({
  name: "acquisition.outreach.dns-check",
  description: "Re-check SPF, DKIM, DMARC and MX for one sending domain, or all of them when none is given.",
  input: z.object({ domain: z.string().default("") }),
  handler: {
    kind: "single",
    run: async (input) => {
      const { checkDomainDns } = await import("./mailboxes/dns");
      const { db } = await import("@/platform/db");
      const actor = { type: "SYSTEM" as const, job: "acquisition.outreach.dns-check" };
      const domains = input.domain !== ""
        ? [input.domain]
        : (await db.sendingDomain.findMany({ select: { domain: true } })).map((d) => d.domain);
      for (const domain of domains) await checkDomainDns(actor, domain);
      return { summary: `checked ${String(domains.length)} domain(s)` };
    },
  },
  concurrency: 1,
  timeoutMs: 60_000,
  retry: { maxAttempts: 2, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 30_000 },
  idempotencyKey: ({ domain }) => `acquisition.outreach.dns-check:${domain === "" ? "all" : domain}:${new Date().toISOString().slice(0, 10)}`,
  allowManualRun: true,
  systemActions: ["acquisition.domain.checkDns"],
});

export const outreachJobs: readonly AnyJobDefinition[] = [
  outreachTickJob,
  outreachSendJob,
  outreachMailboxHealthJob,
  outreachDnsCheckJob,
];
