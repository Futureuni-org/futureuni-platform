/**
 * `acquisition.lead.advance` — the durable, per-lead pipeline workflow (Phase 19, module spec §5.2).
 *
 * A workflow-kind job (docs/contracts/jobs.md): its four side-effecting steps live in `inlineStep`
 * calls, so Workflow retries a failed step and the idempotent status guards make a whole-run retry
 * resume where it left off. The run's idempotency key is `leadId + advanceVersion` (the job's
 * `idempotencyKey`), so a duplicated `lead.created` event collapses to one run while a deliberate
 * re-queue (new `advanceVersion`) starts a fresh run.
 *
 * Steps (each skips when the lead is already past it, so the chain is idempotent):
 *  1. enrich  — NEW → ENRICHED (Phase 9); compliance may hold or disqualify here.
 *  2. audit   — ENRICHED → AUDITED (Phase 10).
 *  3. score   — AUDITED → SCORED / NURTURE / DISQUALIFIED, and the brief (Phase 11).
 *  4. draft   — SCORED → IN_REVIEW first-touch draft (Phase 12), only when the lead is the leading
 *               lead of its cross-sell group (enforced inside `createDraft`, INV-9) and the line's
 *               throttle isn't PAUSED.
 *
 * Top-level imports stay minimal (types + `defineJob`) so the manifest's codegen graph never pulls
 * the platform job runtime or the area services; everything else is imported lazily inside the
 * entry, at run time.
 */

import { z } from "zod";

import type { AnyJobDefinition, JobContext, JobResult } from "@/contracts/jobs";
import { defineJob } from "@/platform/registry/define";

/** The SYSTEM actor every advance run acts as; its `systemActions` gate what the steps may do. */
export const ADVANCE_JOB_NAME = "acquisition.lead.advance";

interface LeadAdvanceInput {
  leadId: string;
  advanceVersion: number;
}

async function entry(input: LeadAdvanceInput, ctx: JobContext): Promise<JobResult> {
  const { inlineStep } = await import("@/platform/jobs");
  const { db } = await import("@/platform/db");
  const { leadId } = input;

  const status = async (): Promise<string | null> => {
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    return lead?.status ?? null;
  };

  await inlineStep(ctx, "enrich", async () => {
    if ((await status()) !== "NEW") return;
    const { enrichLead } = await import("@/modules/acquisition/enrichment");
    await enrichLead({ leadId, actor: ctx.actor });
  });

  await inlineStep(ctx, "audit", async () => {
    // ENRICHED is the normal entry; AUDITING is a crashed/stuck mid-audit the sweeper re-ran.
    const current = await status();
    if (current !== "ENRICHED" && current !== "AUDITING") return;
    const { runAudits } = await import("@/modules/acquisition/audits");
    await runAudits({
      leadId,
      actor: ctx.actor,
      jobRunId: ctx.jobRunId,
      force: false,
      now: () => ctx.clock.now(),
      signal: ctx.signal,
      log: ctx.log,
    });
  });

  await inlineStep(ctx, "score", async () => {
    if ((await status()) !== "AUDITED") return;
    const { qualifyLead } = await import("@/modules/acquisition/scoring");
    await qualifyLead(leadId, { actor: ctx.actor, jobRunId: ctx.jobRunId, clock: ctx.clock });
  });

  await inlineStep(ctx, "draft", async () => {
    const lead = await db.lead.findUnique({
      where: { id: leadId },
      select: { status: true, serviceLine: true, heldByCrossSell: true },
    });
    if (lead === null) return;
    if (lead.status !== "SCORED" || lead.heldByCrossSell) return;
    const { getOutreachThrottle } = await import("@/modules/acquisition/scoring");
    const throttle = await getOutreachThrottle(lead.serviceLine);
    if (throttle.mode === "PAUSED") return;
    // createDraft re-checks the cross-sell lead and transitions SCORED → IN_REVIEW (INV-9).
    const { createDraft } = await import("@/modules/acquisition/outreach");
    await createDraft(ctx.actor, { leadId, stepIndex: 0, system: true });
  });

  return { summary: `advanced:${(await status()) ?? "gone"}` };
}

export const leadAdvanceJob: AnyJobDefinition = defineJob<LeadAdvanceInput>({
  name: ADVANCE_JOB_NAME,
  description:
    "Advance one lead through enrich → audit → score → first-touch draft as resumable, idempotent steps.",
  input: z.object({ leadId: z.string().min(1), advanceVersion: z.int().min(0) }),
  handler: { kind: "workflow", entry, steps: ["enrich", "audit", "score", "draft"] },
  // A global hard cap; the per-line and global soft limits live in settings and are enforced before
  // the run is enqueued (see `start.ts`), so a big search can't starve other lines.
  concurrency: 10,
  timeoutMs: 300_000, // per step for workflow handlers
  retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 5_000, maxDelayMs: 120_000 },
  idempotencyKey: ({ leadId, advanceVersion }) =>
    `acquisition.lead.advance:${leadId}:${String(advanceVersion)}`,
  allowManualRun: true,
  // The union of what the steps' services assert under a SYSTEM actor: enrichment (lead.update,
  // lead.reaudit) and scoring (lead.disqualify, lead.assign). Audits and the system-mode draft
  // assert nothing extra.
  systemActions: [
    "acquisition.lead.update",
    "acquisition.lead.reaudit",
    "acquisition.lead.disqualify",
    "acquisition.lead.assign",
  ],
});
