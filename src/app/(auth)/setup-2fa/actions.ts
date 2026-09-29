"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth, requireUser } from "@/platform/auth";
import { sendEmail } from "@/platform/notifications";
import { AppError, isAppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";
import { db } from "@/platform/db";

const StartInput = z.object({ password: z.string().min(1) });
const VerifyInput = z.object({ code: z.string().regex(/^\d{6}$/) });

export interface EnableResult {
  totpUri: string;
  secret: string;
  backupCodes: string[];
}

export async function startEnable2FA(
  formData: FormData,
): Promise<ActionResult<EnableResult>> {
  await requireUser();
  const parsed = StartInput.safeParse({ password: formData.get("password") });
  if (!parsed.success) return err(new AppError("VALIDATION_FAILED"));
  try {
    const response = await auth.api.enableTwoFactor({
      body: { password: parsed.data.password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "Password isn't right."));
    const body = (await response.clone().json()) as {
      totpURI?: string;
      backupCodes?: string[];
      secret?: string;
    };
    return ok({
      totpUri: body.totpURI ?? "",
      secret: body.secret ?? "",
      backupCodes: body.backupCodes ?? [],
    });
  } catch (error) {
    return err(isAppError(error) ? error : new AppError("INTERNAL"));
  }
}

export async function verifyEnable2FA(
  formData: FormData,
): Promise<ActionResult<{ done: true }>> {
  const user = await requireUser();
  const parsed = VerifyInput.safeParse({ code: formData.get("code") });
  if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Enter the 6-digit code."));
  try {
    const response = await auth.api.verifyTOTP({
      body: { code: parsed.data.code },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "That code isn't valid."));
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, mustSetUp2fa: false },
    });
    await sendEmail({
      template: "two-factor-enabled",
      to: user.email,
      props: { name: user.name },
    });
    return ok({ done: true });
  } catch (error) {
    return err(isAppError(error) ? error : new AppError("INTERNAL"));
  }
}
