"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { acceptInvite } from "@/platform/auth/invites";
import { auth } from "@/platform/auth";
import { AppError, isAppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";

const InputSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
});

export interface AcceptSuccess {
  redirect: string;
}

export async function acceptInviteAction(
  formData: FormData,
): Promise<ActionResult<AcceptSuccess>> {
  const parsed = InputSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return err(new AppError("VALIDATION_FAILED", "Some details need correcting."));
  }
  try {
    const requestHeaders = await headers();
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
    const userAgent = requestHeaders.get("user-agent") ?? undefined;
    const result = await acceptInvite(parsed.data, {
      ...(ip === undefined ? {} : { ip }),
      ...(userAgent === undefined ? {} : { userAgent }),
    });
    // Sign the new user in immediately.
    try {
      await auth.api.signInEmail({
        body: { email: result.email, password: parsed.data.password },
        headers: requestHeaders,
        asResponse: true,
      });
    } catch {
      // Post-transaction sign-in failure isn't fatal: the user can sign in from /login.
    }
    return ok({ redirect: result.role === "ADMIN" ? "/setup-2fa" : "/" });
  } catch (error) {
    if (isAppError(error)) return err(error);
    return err(new AppError("INTERNAL"));
  }
}
