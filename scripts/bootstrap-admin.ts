/**
 * `pnpm bootstrap:admin` (Phase 21). Prepares a fresh PRODUCTION database for launch:
 *
 *  1. Refuses to run anywhere but production, and never runs the development seed.
 *  2. Sets the launch-safety production defaults (idempotent): the global outreach kill switch ON,
 *     and a low per-line first-touch cap. (AI budgets are set by the admin in /admin/ai-usage per
 *     docs/cost-model.md — a shape that lives behind `ai.budgets`.)
 *  3. Reports whether a first ADMIN exists and, if not, prints the exact next step.
 *
 * It is idempotent: running it twice leaves the same rows. Settings are validated against their
 * registered schemas before they are written. Run it once, right after the first production deploy.
 *
 * Note (documented follow-up): creating the first ADMIN with an invite link needs an
 * unauthenticated bootstrap path in `@/platform/auth` (the normal `createInvite` requires an
 * existing inviter). Until that helper lands, create the first admin via the runbook's documented
 * step; this script sets the safety defaults so production can never send on day one.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

function fail(message: string): never {
  console.error(`error ${message}`);
  process.exit(1);
}

/** Only production, or an explicit, deliberate local run (BOOTSTRAP_CONFIRM=1). Never the seed. */
function assertAllowed(): void {
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (!isProd && process.env.BOOTSTRAP_CONFIRM !== "1") {
    fail(
      "bootstrap:admin runs in production (VERCEL_ENV=production). For a deliberate local run set BOOTSTRAP_CONFIRM=1.",
    );
  }
}

interface SafetyDefault {
  key: string;
  scope: "PLATFORM" | "MODULE" | "USER";
  module: string | null;
  value: unknown;
}

const SAFETY_DEFAULTS: SafetyDefault[] = [
  // The kill switch stays ON until the launch checklist is green (project-rules §Launch gates).
  { key: "acquisition.outreach.globalPause", scope: "MODULE", module: "acquisition", value: true },
  // A conservative first-touch cap for the first two weeks (profiles stay in ALWAYS_REVIEW).
  { key: "acquisition.firstTouchDailyCapPerLine", scope: "MODULE", module: "acquisition", value: 10 },
];

async function main(): Promise<void> {
  assertAllowed();

  const { db } = await import("@/platform/db");
  const { getSettingDefinitions } = await import("@/platform/registry");
  const definitions = new Map(getSettingDefinitions().map((d) => [d.key, d]));

  for (const setting of SAFETY_DEFAULTS) {
    const def = definitions.get(setting.key);
    if (def === undefined) fail(`Unknown setting key "${setting.key}" — not registered.`);
    const parsed = def.schema.safeParse(setting.value);
    if (!parsed.success) fail(`Invalid default for "${setting.key}": ${parsed.error.message}`);

    // Settings have a partial unique index; find-then-write by id (never upsert through it).
    const existing = await db.setting.findFirst({
      where: { key: setting.key, scope: setting.scope, module: setting.module, userId: null },
      select: { id: true },
    });
    if (existing === null) {
      await db.setting.create({
        data: {
          key: setting.key,
          scope: setting.scope,
          module: setting.module,
          userId: null,
          value: parsed.data as never,
        },
      });
    } else {
      await db.setting.update({ where: { id: existing.id }, data: { value: parsed.data as never } });
    }
    process.stdout.write(`ok set ${setting.key} = ${JSON.stringify(parsed.data)}\n`);
  }

  const adminCount = await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
  if (adminCount === 0) {
    process.stdout.write(
      "\nNo active ADMIN yet. Create the first admin following docs/runbook.md " +
        "'First admin', then sign in and set up 2FA (required for admins).\n",
    );
  } else {
    process.stdout.write(`\nok ${String(adminCount)} active admin(s) already exist.\n`);
  }

  process.stdout.write(
    "\nProduction safety defaults are set: outreach is PAUSED and first-touch caps are low. " +
      "Set AI budgets in /admin/ai-usage (see docs/cost-model.md), then work the launch checklist.\n",
  );
  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
