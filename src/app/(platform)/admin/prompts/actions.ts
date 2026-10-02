"use server";

/**
 * Server actions for the prompts admin screen. `@/platform/ai` owns authorisation
 * (platform.prompt.publish/activate) and the eval regression gate.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import { activatePromptVersion, diffPromptVersions, publishPromptVersion } from "@/platform/ai";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

export async function publishPromptAction(
  task: string,
  note: string,
  force: boolean,
  forceReason: string,
): Promise<ActionResult<{ version: number; evalScore: number; previousScore: number | null }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ task: z.string().min(1), note: z.string().trim().min(1).max(500) })
      .safeParse({ task, note });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await publishPromptVersion(
      actor,
      parsed.data.task,
      parsed.data.note,
      force ? { force: true, forceReason: forceReason.trim() } : {},
    );
    revalidatePath("/admin/prompts");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function activatePromptAction(
  task: string,
  version: number,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ task: z.string().min(1), version: z.number().int().min(1) }).safeParse({ task, version });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await activatePromptVersion(actor, parsed.data.task, parsed.data.version);
    revalidatePath("/admin/prompts");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function diffPromptsAction(
  task: string,
  a: number,
  b: number,
): Promise<ActionResult<{ a: string; b: string }>> {
  try {
    const user = await requireUser();
    assertCan(user, "platform.prompt.read");
    const result = await diffPromptVersions(task, a, b);
    return ok(result);
  } catch (error) {
    return err(error);
  }
}
