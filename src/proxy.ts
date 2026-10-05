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

/**
 * Security headers (Phase 20, SEC-2). A nonce-based CSP follows the Next.js canonical pattern
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md): the nonce is set on the
 * request's `Content-Security-Policy` + `x-nonce` headers, and Next applies it to its own scripts.
 * `script-src` is strict (nonce + strict-dynamic); `style-src` keeps `'unsafe-inline'` so React inline
 * style attributes don't break (a documented pragmatic relaxation — styles aren't the XSS vector).
 * The CSP must be verified against a real `next build` across every route/role before launch (see
 * docs/hardening-report.md); the rest of the headers are safe to enforce unconditionally.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

/** The headers set on every response: a strict-ish CSP plus the hardening headers. */
function applySecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()",
  );
  // HSTS only matters over HTTPS; harmless on localhost. Two years, subdomains, preload.
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  return response;
}

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
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const headers = new Headers(request.headers);
  headers.set("x-next-pathname", pathname + search);
  // The nonce must reach the renderer on the request headers, so Next applies it to its scripts.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next({ request: { headers } }), csp);
  }

  const cookie = getSessionCookie(request);
  if (cookie !== null && cookie !== "") {
    return applySecurityHeaders(NextResponse.next({ request: { headers } }), csp);
  }

  const nextParam = safeNext(pathname + search);
  const url = new URL(`/login`, request.url);
  if (nextParam !== "/") url.searchParams.set("next", nextParam);
  return applySecurityHeaders(NextResponse.redirect(url), csp);
}

export const config = {
  // Match everything except Next's own assets and static files. Individual public prefixes are
  // still checked in the handler above so we always attach `x-next-pathname`.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
