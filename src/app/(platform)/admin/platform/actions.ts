"use server";

/**
 * Server actions for the platform settings screen. `setSetting` enforces each setting's own
 * requiredPermission; the module toggle asserts platform.module.toggle; the retention preview asserts
 * acquisition.retention.preview.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import { setSetting } from "@/platform/settings";
import { runAcquisitionRetentionPurge } from "@/modules/acquisition/compliance";

import { writeModuleEnabled } from "./platform.repo";

export async function saveSettingAction(key: string, value: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ key: z.string().min(1) }).safeParse({ key });
    if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Invalid setting key."));
    await setSetting(actor, parsed.data.key, value, {});
    revalidatePath("/admin/platform");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function moduleToggleAction(
  moduleId: string,
  enabled: boolean,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    assertCan(user, "platform.module.toggle");
    const parsed = z.object({ moduleId: z.string().min(1) }).safeParse({ moduleId });
    if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Invalid module."));
    await writeModuleEnabled(actorOf(user), parsed.data.moduleId, enabled);
    revalidatePath("/admin/platform");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function retentionPreviewAction(): Promise<
  ActionResult<{ cutoff: string; candidates: number }>
> {
  try {
    const actor = actorOf(await requireUser());
    const result = await runAcquisitionRetentionPurge(actor, { dryRun: true });
    return ok({ cutoff: result.cutoff, candidates: result.candidates });
  } catch (error) {
    return err(error);
  }
}
