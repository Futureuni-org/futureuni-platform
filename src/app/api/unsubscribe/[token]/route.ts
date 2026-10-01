/**
 * `POST /api/unsubscribe/[token]` — the RFC 8058 one-click unsubscribe endpoint (Phase 12, step 6).
 * No session and no confirmation step: it verifies the signed token, suppresses and stops
 * enrolments, and returns 200. Idempotent. A tampered or revoked token returns 404. It is never
 * answered with a message (INV-23). The proxy allow-lists `/api/unsubscribe/*`; this handler still
 * verifies the token itself.
 */

import "server-only";

import { errorResponse } from "@/lib/errors";
import { processUnsubscribe } from "@/modules/acquisition/outreach/unsubscribe/unsubscribe";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  try {
    const { token } = await ctx.params;
    // Optional feedback from the confirmation page (JSON body); the one-click POST sends none.
    let reason: string | undefined;
    if (request.headers.get("content-type")?.includes("application/json") === true) {
      const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
      if (body !== null && typeof body.reason === "string") reason = body.reason;
    }
    const result = await processUnsubscribe(token, reason === undefined ? {} : { reason });
    if (!result.ok) {
      return Response.json({ error: { code: "NOT_FOUND", message: "This link is not valid." } }, { status: 404 });
    }
    return Response.json({ unsubscribed: true }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

// Some mail clients and link checkers issue a GET; treat it the same so the opt-out still takes effect.
export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  return POST(request, ctx);
}
