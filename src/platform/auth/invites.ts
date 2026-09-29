/**
 * Invite service (docs/specs/platform.md §7, phase prompt Step 2).
 *
 * Rules:
 *   - Only invite-only sign-up (`disableSignUp: true` in Better Auth).
 *   - Tokens are 32 bytes, printed as base64url and stored as SHA-256 hex. Single-use, 7-day
 *     expiry (INV — hardcoded here; a follow-up wires it to `auth.inviteExpiryDays` from
 *     `@/platform/settings` once Phase 6 lands).
 *   - Every mutation writes to the audit log through `SEAM-AUDIT`.
 *   - `createInvite` is permission-checked with `platform.user.invite`:
 *     - ADMIN → ALL (may invite ADMIN too).
 *     - MANAGER → CEIL (may invite MANAGER, SERVICE_LEAD or MEMBER but never ADMIN).
 *   - Duplicate invites for an active user are rejected with a friendly, non-leaking message.
 *   - `acceptInvite` runs the whole flow in one transaction: create User, TeamProfile, credential
 *     Account (with Better Auth's password hasher), mark the invite used, write the audit entry.
 *     A failure anywhere rolls the whole thing back.
 */

import "server-only";

import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { RoleSchema, ServiceLineSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db, isUniqueViolation, withTransaction, type Tx } from "@/platform/db";

import { actorOf } from "./permissions";
import { recordAudit, sendAuthEmail } from "./_seams";
import { assertCan } from "./permissions";
import { checkPassword } from "./password";
import { INVITE_ACCEPT_LIMIT, INVITE_CREATE_LIMIT, consume } from "./rate-limit";
import { hashToken, newToken } from "./tokens";
import { env } from "@/env";

const INVITE_EXPIRY_DAYS = 7;

export interface Inviter {
  id: string;
  role: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
  serviceLines: string[];
  canApprove: boolean;
  status?: "ACTIVE" | "DEACTIVATED";
}

export const CreateInviteInputSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: RoleSchema,
  serviceLines: z.array(ServiceLineSchema).default([]),
});
export type CreateInviteInput = z.infer<typeof CreateInviteInputSchema>;

export interface CreatedInvite {
  id: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
  expiresAt: Date;
  link: string;
}

export async function createInvite(
  actor: Inviter,
  raw: CreateInviteInput,
): Promise<CreatedInvite> {
  const input = CreateInviteInputSchema.parse(raw);
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.invite",
    { targetRole: input.role },
  );
  await consume(INVITE_CREATE_LIMIT, actor.id);

  const existingUser = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, status: true },
  });
  if (existingUser !== null && existingUser.status === "ACTIVE") {
    throw new AppError("CONFLICT", "That email already belongs to an active user.");
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  let created;
  try {
    created = await db.invite.create({
      data: {
        email: input.email,
        role: input.role,
        serviceLines: input.serviceLines,
        tokenHash: token.hash,
        expiresAt,
        invitedById: actor.id,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
  } catch (error) {
    if (isUniqueViolation(error, "invites_email_pending_key")) {
      throw new AppError(
        "CONFLICT",
        "An invitation for that email is already pending. Revoke or resend it instead.",
      );
    }
    throw error;
  }

  const link = inviteLink(token.plain);
  await sendAuthEmail({ kind: "invite", to: created.email, link });
  await recordAudit(null, {
    actor: actorOf({ id: actor.id, role: actor.role }),
    action: "platform.user.invite",
    targetType: "Invite",
    targetId: created.id,
    after: { email: created.email, role: created.role, serviceLines: input.serviceLines },
  });
  return { ...created, link };
}

export async function revokeInvite(actor: Inviter, inviteId: string): Promise<void> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.invite",
    { targetRole: "MEMBER" },
  );
  const invite = await db.invite.findUnique({ where: { id: inviteId } });
  if (invite === null) throw new AppError("NOT_FOUND");
  if (invite.usedAt !== null || invite.revokedAt !== null) {
    throw new AppError("CONFLICT", "That invite has already been used or revoked.");
  }
  await db.invite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await recordAudit(null, {
    actor: actorOf({ id: actor.id, role: actor.role }),
    action: "platform.user.invite.revoke",
    targetType: "Invite",
    targetId: inviteId,
  });
}

export async function resendInvite(actor: Inviter, inviteId: string): Promise<CreatedInvite> {
  assertCan(
    { id: actor.id, role: actor.role, serviceLines: [], canApprove: actor.canApprove },
    "platform.user.invite",
    { targetRole: "MEMBER" },
  );
  await consume(INVITE_CREATE_LIMIT, actor.id);
  const invite = await db.invite.findUnique({ where: { id: inviteId } });
  if (invite === null) throw new AppError("NOT_FOUND");
  if (invite.usedAt !== null) {
    throw new AppError("CONFLICT", "That invite has already been accepted.");
  }
  if (invite.revokedAt !== null) {
    throw new AppError("CONFLICT", "That invite was revoked. Create a new one.");
  }

  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const updated = await db.invite.update({
    where: { id: inviteId },
    data: {
      tokenHash: token.hash,
      expiresAt,
      lastSentAt: new Date(),
      sendCount: { increment: 1 },
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  const link = inviteLink(token.plain);
  await sendAuthEmail({ kind: "invite", to: updated.email, link });
  await recordAudit(null, {
    actor: actorOf({ id: actor.id, role: actor.role }),
    action: "platform.user.invite.resend",
    targetType: "Invite",
    targetId: inviteId,
  });
  return { ...updated, link };
}

export const AcceptInviteInputSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
});
export type AcceptInviteInput = z.infer<typeof AcceptInviteInputSchema>;

export interface AcceptResult {
  userId: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SERVICE_LEAD" | "MEMBER";
}

/**
 * Accept an invite. One transaction: creates User + TeamProfile + credential Account, marks the
 * invite used, writes the audit entry. On any failure everything rolls back.
 */
export async function acceptInvite(
  raw: AcceptInviteInput,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<AcceptResult> {
  const input = AcceptInviteInputSchema.parse(raw);
  const strength = checkPassword(input.password);
  if (!strength.ok) {
    throw new AppError(
      "VALIDATION_FAILED",
      strength.reason === "TOO_SHORT"
        ? "Password must be at least 12 characters."
        : "Password is too common. Pick something less predictable.",
      { details: { field: "password", reason: strength.reason } },
    );
  }
  await consume(INVITE_ACCEPT_LIMIT, meta.ip ?? "unknown");

  const tokenHash = hashToken(input.token);
  const passwordHash = await hashPassword(input.password);

  const result = await withTransaction(async (tx: Tx) => {
    const invite = await tx.invite.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        serviceLines: true,
      },
    });
    if (invite === null) {
      throw new AppError("VALIDATION_FAILED", "This invitation link is invalid or has expired.");
    }
    // Refuse if a user already exists for this email — the invite is a stale duplicate.
    const existing = await tx.user.findUnique({
      where: { email: invite.email },
      select: { id: true, status: true },
    });
    if (existing !== null && existing.status === "ACTIVE") {
      throw new AppError("CONFLICT", "That email already belongs to an active user.");
    }
    const user =
      existing === null
        ? await tx.user.create({
            data: {
              email: invite.email,
              name: input.name,
              emailVerified: true,
              role: invite.role,
              status: "ACTIVE",
              mustSetUp2fa: invite.role === "ADMIN",
            },
            select: { id: true, email: true, role: true },
          })
        : await tx.user.update({
            where: { id: existing.id },
            data: {
              name: input.name,
              status: "ACTIVE",
              role: invite.role,
              emailVerified: true,
              mustSetUp2fa: invite.role === "ADMIN",
              deactivatedAt: null,
              banned: false,
            },
            select: { id: true, email: true, role: true },
          });

    await tx.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: passwordHash,
      },
      update: { password: passwordHash },
    });

    await tx.teamProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        serviceLines: invite.serviceLines,
      },
      update: {
        serviceLines: invite.serviceLines,
      },
    });

    await tx.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), acceptedUserId: user.id },
    });

    await recordAudit(tx, {
      actor: { type: "USER", userId: user.id, role: user.role },
      action: "platform.user.acceptInvite",
      targetType: "User",
      targetId: user.id,
      after: { role: user.role, serviceLines: invite.serviceLines },
      ...(meta.ip === undefined ? {} : { ip: meta.ip }),
      ...(meta.userAgent === undefined ? {} : { userAgent: meta.userAgent }),
    });

    return { userId: user.id, email: user.email, role: user.role };
  });

  return result;
}

function inviteLink(plain: string): string {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}/invite/${encodeURIComponent(plain)}`;
}
