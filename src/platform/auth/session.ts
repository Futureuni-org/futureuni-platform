/**
 * Session helpers exposed as `@/platform/auth` (docs/specs/platform.md §7 API).
 *
 * `getCurrentUser` is memoised per request with React `cache()`, so the composite of session
 * cookie + user + team profile lookups happens once per RSC render.
 *
 * `requireUser` redirects to `/login?next=<current-path>` in an RSC and route handler, and
 * throws `AppError("UNAUTHENTICATED", 401)` inside server actions when no request URL is
 * available. `redirect()` from `next/navigation` throws internally, which propagates through
 * server actions the same way an error would.
 */

import "server-only";

import { cache } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { PermissionAction, PermissionResource } from "@/contracts/permissions";
import type { Role, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

import { auth } from "./auth";
import { assertCan, can } from "./permissions";

/** Public shape (docs/specs/platform.md §7). Never carries password hash, tokens or 2FA secret. */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  serviceLines: ServiceLine[];
  canApprove: boolean;
  timezone: string;
  twoFactorEnabled: boolean;
  status: "ACTIVE" | "DEACTIVATED";
  mustSetUp2fa: boolean;
}

/** Per-request cached lookup: at most one DB query per RSC render tree. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (session === null) return null;
  const userId = (session as { user?: { id?: string } }).user?.id;
  if (userId === undefined) return null;

  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      twoFactorEnabled: true,
      mustSetUp2fa: true,
      teamProfile: {
        select: { serviceLines: true, canApprove: true, timezone: true },
      },
    },
  });
  if (row === null) return null;
  if (row.status === "DEACTIVATED") return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    role: row.role,
    serviceLines: row.teamProfile?.serviceLines ?? [],
    canApprove: row.teamProfile?.canApprove ?? false,
    timezone: row.teamProfile?.timezone ?? "Africa/Lagos",
    twoFactorEnabled: row.twoFactorEnabled,
    status: row.status,
    mustSetUp2fa: row.mustSetUp2fa,
  };
});

/**
 * Redirects to /login?next=<current-path> in RSC / server actions when no session exists.
 * `redirect()` throws internally and never returns, so downstream code sees a non-null value.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user !== null) return user;
  const path = await currentPathForNext();
  const next = path === null ? "" : `?next=${encodeURIComponent(path)}`;
  redirect(`/login${next}`);
}

async function currentPathForNext(): Promise<string | null> {
  try {
    const requestHeaders = await headers();
    // The proxy sets x-next-pathname so RSC and route handlers can build the redirect target.
    const forwarded = requestHeaders.get("x-next-pathname");
    if (forwarded !== null && forwarded !== "") return forwarded;
  } catch {
    // No request context (e.g. build-time render): nothing to hand back.
  }
  return null;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AppError("FORBIDDEN");
  }
  return user;
}

export async function requirePermission(
  action: PermissionAction,
  resource?: PermissionResource,
): Promise<CurrentUser> {
  const user = await requireUser();
  assertCan(user, action, resource);
  return user;
}

/** Convenience for pages/components that want a boolean instead of throwing. */
export function canFromUser(
  user: CurrentUser | null,
  action: PermissionAction,
  resource?: PermissionResource,
): boolean {
  if (user === null) return false;
  return can(user, action, resource);
}
