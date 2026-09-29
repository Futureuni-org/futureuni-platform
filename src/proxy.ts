/**
 * Next.js request proxy (Next 16 file convention; ADR-013, docs/prompts/wave-1/phase-03-auth.md
 * Step 4 "Route protection").
 *
 * Responsibilities:
 *   - Redirect unauthenticated requests on `(platform)` routes to `/login?next=<path>`.
 *   - Pass the current pathname through to server code as `x-next-pathname`, so `requireUser`
 *     can build a same-origin redirect target without another request.
 *   - Leave every public route untouched (login/reset/invite/signed-out, /api/auth,
 *     /api/health, /api/cron, /api/webhooks, /api/unsubscribe, /u, /.well-known/* including
 *     Workflow's `/.well-known/workflow/*` per Phase 1 CR-01, and Next's own assets).
 *
 * The proxy is **not** the security control. Every server action, RSC and route handler
 * calls `requireUser` / `requirePermission` on its own. This proxy only saves a round-trip
 * to the RSC for the unauthenticated case.
 */

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/platform/auth/redirect";

const PUBLIC_PREFIXES = [
  "/login",
  "/invite/",
  "/reset",
  "/signed-out",
  "/u/",
  "/api/auth/",
  "/api/health",
  "/api/cron/",
  "/api/webhooks/",
  "/api/unsubscribe/",
  "/.well-known/",
] as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-next-pathname", pathname + search);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const cookie = getSessionCookie(request);
  if (cookie !== null && cookie !== "") {
    return NextResponse.next({ request: { headers } });
  }

  const nextParam = safeNext(pathname + search);
  const url = new URL(`/login`, request.url);
  if (nextParam !== "/") url.searchParams.set("next", nextParam);
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except Next's own assets and static files. Individual public prefixes are
  // still checked in the handler above so we always attach `x-next-pathname`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
