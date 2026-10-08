"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { safeNext } from "@/platform/auth";
import { auth } from "@/platform/auth";
import { AppError, isAppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";

const TotpInput = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  trustDevice: z.boolean(),
  next: z.string().max(2048).optional(),
});
const BackupInput = z.object({
  code: z.string().min(8).max(20),
  trustDevice: z.boolean(),
  next: z.string().max(2048).optional(),
});

export async function verifyTotpAction(
  formData: FormData,
): Promise<ActionResult<{ redirect: string }>> {
  const parsed = TotpInput.safeParse({
    code: formData.get("code"),
    trustDevice: formData.get("trustDevice") === "on",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Enter the 6-digit code."));
  try {
    const response = await auth.api.verifyTOTP({
      body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "That code isn't valid."));
    return ok({ redirect: safeNext(parsed.data.next ?? "/") });
  } catch (error) {
    return err(
      isAppError(error) ? error : new AppError("UNAUTHENTICATED", "That code isn't valid."),
    );
  }
}

export async function verifyBackupAction(
  formData: FormData,
): Promise<ActionResult<{ redirect: string }>> {
  const parsed = BackupInput.safeParse({
    code: formData.get("code"),
    trustDevice: formData.get("trustDevice") === "on",
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Enter a backup code."));
  try {
    const response = await auth.api.verifyBackupCode({
      body: { code: parsed.data.code, trustDevice: parsed.data.trustDevice },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "That code isn't valid."));
    return ok({ redirect: safeNext(parsed.data.next ?? "/") });
  } catch (error) {
    return err(
      isAppError(error) ? error : new AppError("UNAUTHENTICATED", "That code isn't valid."),
    );
  }
}
