/**
 * Phase 20 (SEC-1): authorization coverage. Enumerates every route handler (src/app route.ts files)
 * and every server-action file (a use-server module), and asserts each one either self-authorizes
 * (calls a session/permission gate) or is on the explicit public allow-list (auth, health,
 * cron+secret, webhooks+signature/token, unsubscribe+token, dev-only). A new unlisted, unguarded
 * endpoint fails this test — so the authorization surface can't silently grow.
 *
 * This is a static coverage gate; representative negative 401/403 behaviour is proven by the
 * per-handler integration tests (e.g. the leads-export route) referenced in docs/hardening-report.md.
 */

import { globSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const rel = (p: string): string => relative(ROOT, p).replaceAll("\\", "/");

/** Session/permission/webhook gates that count as "this endpoint authorizes itself". */
const GATE =
  /\b(requireUser|requireRole|requirePermission|getCurrentUser|canFromUser|assertCan|assertActorCan|resolveProviderKey|resolveWebhookSecret|verifyUnsubscribeToken|tokenMatches|verifyLeadRef|CRON_SECRET|toNextJsHandler|verifySignature|verifyWebhookSignature)\b/;

/** Public endpoints that verify themselves by secret/signature/token, or are pre-session flows. */
const PUBLIC_ROUTES = new Set([
  "src/app/api/health/route.ts",
  "src/app/api/cron/tick/route.ts",
  "src/app/api/auth/[...all]/route.ts",
  "src/app/api/unsubscribe/[token]/route.ts",
  "src/app/api/webhooks/outbound/[provider]/route.ts",
  "src/app/api/webhooks/calendar/[provider]/route.ts",
  "src/app/api/webhooks/inbound/[provider]/route.ts",
  "src/app/api/dev/emails/[template]/route.ts", // dev-only; 404 in production
]);

/** Pre-session action files (login/reset/invite) — authorization is the flow itself. */
const PUBLIC_ACTION_DIRS = ["src/app/(auth)/"];

function listRouteHandlers(): string[] {
  return globSync("src/app/**/route.ts", { cwd: ROOT }).map((p) => join(ROOT, p));
}

function listServerActionFiles(): string[] {
  const files = globSync("src/**/*.ts", { cwd: ROOT }).map((p) => join(ROOT, p));
  return files.filter((file) => {
    if (file.endsWith(".test.ts")) return false;
    const head = readFileSync(file, "utf8").slice(0, 400);
    // A real server-action module opens with the "use server" directive.
    return /^\s*(\/\*[\s\S]*?\*\/\s*)?["']use server["']/.test(head);
  });
}

describe("authorization coverage (SEC-1)", () => {
  it("every non-public route handler authorizes itself", () => {
    const unguarded: string[] = [];
    for (const file of listRouteHandlers()) {
      const path = rel(file);
      if (PUBLIC_ROUTES.has(path)) continue;
      if (!GATE.test(readFileSync(file, "utf8"))) unguarded.push(path);
    }
    expect(
      unguarded,
      `route handlers missing an auth gate (add a gate or allow-list):\n${unguarded.join("\n")}`,
    ).toEqual([]);
  });

  it("every non-public server-action file authorizes", () => {
    const unguarded: string[] = [];
    for (const file of listServerActionFiles()) {
      const path = rel(file);
      if (PUBLIC_ACTION_DIRS.some((dir) => path.startsWith(dir))) continue;
      if (!GATE.test(readFileSync(file, "utf8"))) unguarded.push(path);
    }
    expect(unguarded, `server-action files missing an auth gate:\n${unguarded.join("\n")}`).toEqual(
      [],
    );
  });

  it("finds a meaningful number of endpoints (the scan isn't silently empty)", () => {
    expect(listRouteHandlers().length).toBeGreaterThanOrEqual(8);
    expect(listServerActionFiles().length).toBeGreaterThanOrEqual(15);
  });

  /**
   * The gate above only proves a verification call is *present*. It passed while
   * `/api/webhooks/{inbound,outbound}` accepted unsigned requests in production, because both
   * treated "no secret configured" as "accept" whenever MOCKS=true — and production runs
   * MOCKS=true. Verified against the live deployment on 2026-10-09: the outbound route reached
   * payload validation (422) with no signature, and the inbound route returned 200.
   *
   * Skipping verification is only ever a local-development convenience, so any route that allows
   * it must also require a secret once deployed.
   */
  it("no public webhook route accepts unverified calls on a deployment", () => {
    const failOpen: string[] = [];
    for (const path of [...PUBLIC_ROUTES].filter((p) => p.includes("/api/webhooks/"))) {
      const source = readFileSync(join(ROOT, path), "utf8");
      // Routes that never skip verification (the secret is simply required) are fine.
      if (!/\bMOCKS\b/.test(source)) continue;
      // Those that do skip it must gate the skip on not being deployed.
      if (!/env\.VERCEL\s*===\s*"1"/.test(source)) failOpen.push(path);
    }
    expect(
      failOpen,
      `webhook routes that skip verification when MOCKS=true without excluding deployments:\n${failOpen.join("\n")}`,
    ).toEqual([]);
  });
});
