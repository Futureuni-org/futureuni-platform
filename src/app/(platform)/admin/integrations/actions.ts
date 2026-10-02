"use server";

/**
 * Server actions for the integrations/credentials admin screen. The credentials service owns
 * authorisation (platform.credential.manage/test, ADMIN), encryption (INV-21) and auditing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import { deleteCredential, saveCredential, testCredential } from "@/platform/credentials";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

export async function saveCredentialAction(
  providerId: string,
  payload: Record<string, string>,
): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ providerId: z.string().min(1), payload: z.record(z.string(), z.string()) })
      .safeParse({ providerId, payload });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const status = await saveCredential(
      actor,
      parsed.data.providerId as Parameters<typeof saveCredential>[1],
      parsed.data.payload,
    );
    revalidatePath("/admin/integrations");
    return ok({ status: status.status });
  } catch (error) {
    return err(error);
  }
}

export async function testCredentialAction(
  providerId: string,
): Promise<ActionResult<{ status: string; error: string | null }>> {
  try {
    const actor = actorOf(await requireUser());
    const result = await testCredential(actor, providerId as Parameters<typeof testCredential>[1]);
    revalidatePath("/admin/integrations");
    return ok({ status: result.status, error: result.lastError });
  } catch (error) {
    return err(error);
  }
}

export async function deleteCredentialAction(providerId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    await deleteCredential(actor, providerId as Parameters<typeof deleteCredential>[1]);
    revalidatePath("/admin/integrations");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}
