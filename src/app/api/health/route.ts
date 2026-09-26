import { env } from "@/env";
import { APP_VERSION } from "@/lib/app-info";

/**
 * GET /api/health: public liveness check. It returns no secrets and no configuration beyond
 * the mock flag. Phase 2 may add a database check through a change request.
 */

export const dynamic = "force-dynamic";

export interface HealthResponse {
  status: "ok";
  version: string;
  commit: string;
  mocks: boolean;
}

export function GET(): Response {
  const body: HealthResponse = {
    status: "ok",
    version: APP_VERSION,
    commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    mocks: env.MOCKS,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
