"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/platform/auth";
import { ok, type ActionResult } from "@/lib/result";
import { AppError } from "@/lib/errors";
import { err } from "@/lib/result";

const RequestSchema = z.object({ email: z.email().trim().toLowerCase() });
const ResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(128),
});

/**
 * Request a password reset. The response never says whether the email exists.
 */
export async function requestResetAction(
  formData: FormData,
): Promise<ActionResult<{ requested: true }>> {
  const parsed = RequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    // Even a bad input reads "if that account exists" to prevent enumeration; the client stops
    // there.
    return ok({ requested: true });
  }
  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: "/reset" },
      headers: await headers(),
      asResponse: true,
    });
  } catch {
    // Never surface a specific error.
  }
  return ok({ requested: true });
}

/** Set a new password with a reset token. Better Auth validates the token. */
export async function resetPasswordAction(
  formData: FormData,
): Promise<ActionResult<{ done: true }>> {
  const parsed = ResetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) return err(new AppError("VALIDATION_FAILED"));
  try {
    const response = await auth.api.resetPassword({
      body: { token: parsed.data.token, newPassword: parsed.data.password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("VALIDATION_FAILED", "This link is no longer valid."));
    return ok({ done: true });
  } catch {
    return err(new AppError("INTERNAL"));
  }
}
