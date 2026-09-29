"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth, safeNext } from "@/platform/auth";
import { AppError, isAppError } from "@/lib/errors";
import { err, ok, type ActionResult } from "@/lib/result";
import { db } from "@/platform/db";

const InputSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
  next: z.string().max(2048).optional(),
});

export interface SignInSuccess {
  redirect: string;
}

/**
 * Sign in with email and password. Never reveals whether the email exists — every failure is
 * "invalid email or password".
 *
 * The action reads Better Auth's result and rewrites the redirect target so:
 *   - a user with `mustSetUp2fa` is sent to /setup-2fa
 *   - a user with 2FA enabled but not yet verified this session is sent to /login/2fa
 *   - everyone else goes to `next` (only same-origin relative paths honoured)
 */
export async function signInWithPassword(formData: FormData): Promise<ActionResult<SignInSuccess>> {
  const parsed = InputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return err(new AppError("VALIDATION_FAILED", "Enter a valid email and password."));
  }
  const input = parsed.data;
  const target = safeNext(input.next ?? "/");

  try {
    const response = await auth.api.signInEmail({
      body: { email: input.email, password: input.password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) {
      return err(new AppError("UNAUTHENTICATED", "Invalid email or password."));
    }
    const body = (await response.clone().json().catch(() => null)) as
      | { twoFactorRedirect?: boolean; user?: { id?: string } }
      | null;

    if (body?.twoFactorRedirect === true) {
      return ok({ redirect: appendNext("/login/2fa", target) });
    }
    const userId = body?.user?.id;
    if (userId !== undefined) {
      const status = await db.user.findUnique({
        where: { id: userId },
        select: { role: true, mustSetUp2fa: true, twoFactorEnabled: true, status: true },
      });
      if (status?.status === "DEACTIVATED") {
        return err(new AppError("UNAUTHENTICATED", "This account has been deactivated."));
      }
      if (status !== null && status.role === "ADMIN" && !status.twoFactorEnabled) {
        return ok({ redirect: appendNext("/setup-2fa", target) });
      }
      if (status?.mustSetUp2fa === true) {
        return ok({ redirect: appendNext("/setup-2fa", target) });
      }
    }
    return ok({ redirect: target });
  } catch (error) {
    if (isAppError(error)) return err(error);
    return err(new AppError("UNAUTHENTICATED", "Invalid email or password."));
  }
}

/** Server-side sign-out for the /signed-out page. */
export async function signOut(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // If Better Auth couldn't invalidate (already signed out), keep going.
  }
  redirect("/signed-out");
}

function appendNext(base: string, next: string): string {
  if (next === "/") return base;
  const url = new URL(base, "http://localhost");
  url.searchParams.set("next", next);
  return `${url.pathname}${url.search}`;
}
