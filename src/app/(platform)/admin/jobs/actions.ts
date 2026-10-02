"use server";

/**
 * Server actions for the jobs admin screen. `@/platform/jobs` owns authorisation
 * (platform.job.retry/cancel). "Run now" asserts platform.job.runNow here, then enqueues.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import { cancelJob, enqueueJob, retryJob } from "@/platform/jobs";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please try again.", { details: { issues } });
}

export async function retryJobAction(jobRunId: string): Promise<ActionResult<{ jobRunId: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ jobRunId: z.string().min(1) }).safeParse({ jobRunId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await retryJob(actor, parsed.data.jobRunId);
    revalidatePath("/admin/jobs");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function cancelJobAction(jobRunId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ jobRunId: z.string().min(1) }).safeParse({ jobRunId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await cancelJob(actor, parsed.data.jobRunId);
    revalidatePath("/admin/jobs");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function runScheduleNowAction(
  jobName: string,
  input: unknown,
): Promise<ActionResult<{ jobRunId: string; deduplicated: boolean }>> {
  try {
    const user = await requireUser();
    assertCan(user, "platform.job.runNow");
    const parsed = z.object({ jobName: z.string().min(1) }).safeParse({ jobName });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await enqueueJob(parsed.data.jobName, input ?? {}, { actor: actorOf(user) });
    revalidatePath("/admin/jobs");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}
