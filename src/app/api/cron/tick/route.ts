/**
 * Vercel Cron endpoint (Phase 6, ADR-033). One entry every 5 minutes; the dispatcher decides
 * which manifest schedules are due in the current slot.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. Anything else is 401. Vercel Cron sets the
 * header when `CRON_SECRET` is configured (per current docs, verified with Context7 by the
 * merge session).
 */

import "server-only";

import { env } from "@/env";
import { errorResponse } from "@/lib/errors";
import { runDispatch } from "@/platform/jobs/dispatcher";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return Response.json({ error: { code: "UNAUTHENTICATED", message: "Bad cron secret." } }, { status: 401 });
    }
    const result = await runDispatch(new Date());
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
