"use server";

/**
 * Server actions for the users & invites admin screen. saas-api shape; `@/platform/auth` owns
 * authorisation (platform.user.*), last-admin protection, session rotation and auditing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { requireUser } from "@/platform/auth";
import {
  changeRole,
  deactivateUser,
  forceSignOut,
  reactivateUser,
  resetUser2FA,
} from "@/platform/auth/users";
import { createInvite, resendInvite, revokeInvite } from "@/platform/auth/invites";

const ROLES = ["ADMIN", "MANAGER", "SERVICE_LEAD", "MEMBER"] as const;
const LINES = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"] as const;

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

interface SessionUser {
  id: string;
  role: (typeof ROLES)[number];
  canApprove: boolean;
  serviceLines: (typeof LINES)[number][];
}

function adminActor(user: SessionUser) {
  return { id: user.id, role: user.role, canApprove: user.canApprove };
}
function inviter(user: SessionUser) {
  return { id: user.id, role: user.role, serviceLines: user.serviceLines, canApprove: user.canApprove };
}

const InviteSchema = z.object({
  email: z.email(),
  role: z.enum(ROLES),
  serviceLines: z.array(z.enum(LINES)).default([]),
});

export async function inviteUserAction(input: {
  email: string;
  role: string;
  serviceLines: string[];
}): Promise<ActionResult<{ email: string; link: string }>> {
  try {
    const user = await requireUser();
    const parsed = InviteSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const invite = await createInvite(inviter(user), parsed.data);
    revalidatePath("/admin/users");
    return ok({ email: invite.email, link: invite.link });
  } catch (error) {
    return err(error);
  }
}

export async function resendInviteAction(inviteId: string): Promise<ActionResult<{ link: string }>> {
  try {
    const user = await requireUser();
    const invite = await resendInvite(inviter(user), inviteId);
    revalidatePath("/admin/users");
    return ok({ link: invite.link });
  } catch (error) {
    return err(error);
  }
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    await revokeInvite(inviter(user), inviteId);
    revalidatePath("/admin/users");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function changeRoleAction(
  userId: string,
  newRole: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = z.object({ userId: z.string().min(1), newRole: z.enum(ROLES) }).safeParse({ userId, newRole });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await changeRole(adminActor(user), parsed.data);
    revalidatePath("/admin/users");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function setUserActiveAction(
  userId: string,
  active: boolean,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    if (active) await reactivateUser(adminActor(user), userId);
    else await deactivateUser(adminActor(user), userId);
    revalidatePath("/admin/users");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function resetUser2faAction(userId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    await resetUser2FA(adminActor(user), userId);
    revalidatePath("/admin/users");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function forceSignOutAction(userId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    await forceSignOut(adminActor(user), userId);
    revalidatePath("/admin/users");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}
