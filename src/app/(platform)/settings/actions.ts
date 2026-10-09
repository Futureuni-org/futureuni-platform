"use server";

/**
 * Personal-settings server actions. Everything here is SELF-scoped: it acts only on the signed-in
 * user. saas-api shape. Profile/password/2FA/session self-service is built here on Better Auth's
 * session-scoped `auth.api.*` methods plus a SELF profile repo (no platform service exists yet).
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { failedAction } from "@/lib/action-error";
import { actorOf, auth, requireUser } from "@/platform/auth";
import { checkPassword } from "@/platform/auth/password";
import { setSetting } from "@/platform/settings";
import { updatePreferences } from "@/platform/notifications";
import { deleteFile } from "@/platform/storage";
import { db } from "@/platform/db";

import { avatarKey } from "@/app/api/avatars/key";

import { updateOwnProfile } from "./profile.repo";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the value and try again.", {
    details: { issues },
  });
}

// ---- Appearance (user-scope settings) --------------------------------------------------------

const USER_SETTING_KEYS = ["user.theme", "user.density", "user.reducedMotion"] as const;

export async function updateUserSettingAction(
  key: string,
  value: unknown,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = z.enum(USER_SETTING_KEYS).safeParse(key);
    if (!parsed.success) return err(fail(parsed.error.issues));
    await setSetting(actorOf(user), parsed.data, value, { userId: user.id });
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "updateUserSettingAction" });
  }
}

// ---- Notifications ---------------------------------------------------------------------------

const PreferenceUpdateSchema = z.object({
  type: z.string().min(1),
  channel: z.enum(["IN_APP", "EMAIL"]),
  enabled: z.boolean(),
});

export async function updateNotificationPreferencesAction(
  updates: z.input<typeof PreferenceUpdateSchema>[],
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = z.array(PreferenceUpdateSchema).min(1).max(100).safeParse(updates);
    if (!parsed.success) return err(fail(parsed.error.issues));
    await updatePreferences(user.id, parsed.data);
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "updateNotificationPreferencesAction" });
  }
}

// ---- Profile (name, avatar, timezone) --------------------------------------------------------

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(3).max(64),
});

export async function updateOwnProfileAction(
  input: z.input<typeof ProfileSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = ProfileSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    await updateOwnProfile(actorOf(user), user.id, {
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    });
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "updateOwnProfileAction" });
  }
}

export async function removeAvatarAction(): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    await updateOwnProfile(actorOf(user), user.id, { image: null });
    // Then drop the stored object, so neither the blob nor its row outlives the avatar. Best
    // effort on purpose: the profile is already clear, and a storage hiccup must not read to the
    // user as "removing failed" when it didn't.
    await deleteFile(avatarKey(user.id)).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({ level: "error", msg: message, action: "removeAvatarAction.deleteFile" }),
      );
    });
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "removeAvatarAction" });
  }
}

// ---- Security: password ----------------------------------------------------------------------

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireUser();
    const strength = checkPassword(newPassword);
    if (!strength.ok) {
      return err(new AppError("VALIDATION_FAILED", "Choose a stronger password (at least 12 characters)."));
    }
    const response = await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) {
      return err(new AppError("UNAUTHENTICATED", "Your current password isn't right."));
    }
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "changePasswordAction" });
  }
}

// ---- Security: 2FA ---------------------------------------------------------------------------

export interface Enable2faResult {
  totpUri: string;
  secret: string;
  backupCodes: string[];
}

export async function start2faAction(password: string): Promise<ActionResult<Enable2faResult>> {
  try {
    await requireUser();
    const response = await auth.api.enableTwoFactor({
      body: { password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "Password isn't right."));
    const bodyJson = (await response.clone().json()) as {
      totpURI?: string;
      backupCodes?: string[];
      secret?: string;
    };
    return ok({
      totpUri: bodyJson.totpURI ?? "",
      secret: bodyJson.secret ?? "",
      backupCodes: bodyJson.backupCodes ?? [],
    });
  } catch (error) {
    return failedAction(error, { action: "start2faAction" });
  }
}

export async function verify2faAction(code: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = z.string().regex(/^\d{6}$/).safeParse(code);
    if (!parsed.success) return err(new AppError("VALIDATION_FAILED", "Enter the 6-digit code."));
    const response = await auth.api.verifyTOTP({
      body: { code: parsed.data },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "That code isn't valid."));
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, mustSetUp2fa: false },
    });
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "verify2faAction" });
  }
}

export async function regenerateBackupCodesAction(
  password: string,
): Promise<ActionResult<{ backupCodes: string[] }>> {
  try {
    await requireUser();
    const response = await auth.api.generateBackupCodes({
      body: { password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "Password isn't right."));
    const bodyJson = (await response.clone().json()) as { backupCodes?: string[] };
    return ok({ backupCodes: bodyJson.backupCodes ?? [] });
  } catch (error) {
    return failedAction(error, { action: "regenerateBackupCodesAction" });
  }
}

export async function disable2faAction(password: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    if (user.role === "ADMIN") {
      return err(new AppError("FORBIDDEN", "Administrators must keep two-factor authentication on."));
    }
    const response = await auth.api.disableTwoFactor({
      body: { password },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("UNAUTHENTICATED", "Password isn't right."));
    await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } });
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "disable2faAction" });
  }
}

// ---- Security: sessions ----------------------------------------------------------------------

export async function revokeSessionAction(token: string): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireUser();
    const response = await auth.api.revokeSession({
      body: { token },
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("INTERNAL", "Couldn't sign out that session."));
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "revokeSessionAction" });
  }
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireUser();
    const response = await auth.api.revokeOtherSessions({
      headers: await headers(),
      asResponse: true,
    });
    if (!response.ok) return err(new AppError("INTERNAL", "Couldn't sign out the other sessions."));
    revalidatePath("/settings");
    return ok({ ok: true });
  } catch (error) {
    return failedAction(error, { action: "revokeOtherSessionsAction" });
  }
}
