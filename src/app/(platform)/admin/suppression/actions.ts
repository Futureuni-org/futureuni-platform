"use server";

/**
 * Server actions for the suppression admin screen. saas-api shape: authenticate → parse with Zod
 * → delegate to the compliance service (which authorises and audits) → typed ActionResult.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import {
  addSuppression,
  removeSuppression,
  importSuppressions,
} from "@/modules/acquisition/compliance";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

const AddSchema = z.object({
  type: z.enum(["EMAIL", "PHONE", "DOMAIN"]),
  value: z.string().trim().min(1).max(320),
  reason: z.enum(["MANUAL", "OBJECTION", "COMPLAINT", "UNSUBSCRIBE"]),
  note: z.string().trim().max(500).optional(),
});

export async function addSuppressionAction(
  input: z.input<typeof AddSchema>,
): Promise<ActionResult<{ stoppedEnrollments: number; suppressedLeads: number }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = AddSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const cascade = await addSuppression(actor, {
      type: parsed.data.type,
      value: parsed.data.value,
      reason: parsed.data.reason,
      source: "MANUAL",
      ...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
    });
    revalidatePath("/admin/suppression");
    return ok({
      stoppedEnrollments: cascade.stoppedEnrollments,
      suppressedLeads: cascade.suppressedLeads,
    });
  } catch (error) {
    return err(error);
  }
}

export async function removeSuppressionAction(
  id: string,
  reason: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ id: z.string().min(1), reason: z.string().trim().min(1).max(500) })
      .safeParse({ id, reason });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await removeSuppression(actor, parsed.data.id, parsed.data.reason);
    revalidatePath("/admin/suppression");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function importSuppressionsAction(
  csv: string,
): Promise<ActionResult<{ added: number; skipped: number; errors: string[] }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ csv: z.string().min(1).max(1_000_000) }).safeParse({ csv });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await importSuppressions(actor, parsed.data.csv);
    revalidatePath("/admin/suppression");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}
