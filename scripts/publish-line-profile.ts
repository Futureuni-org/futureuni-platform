/**
 * `pnpm profiles:publish <LINE>` — publish a service line's CODE-DEFAULT profile as a new
 * active version.
 *
 * Why this exists: `ensureDefaultProfiles` (the seeder and `bootstrap:admin`) only ever seeds a
 * line that has NO versions, or supersedes an untouched placeholder v1. Once a line has a real
 * published version, it is left alone on purpose, so that a deploy can never silently overwrite
 * an edit someone made in /acquisition/<line>/settings. The consequence is that editing
 * `src/modules/acquisition/profiles/defaults/*.ts` and redeploying does NOT change what the live
 * pipeline uses — the active profile lives in the database. This script is the deliberate,
 * audited way to push a code-default change live.
 *
 * It archives the current active version and publishes the code default as the next version, with
 * a note naming this script so the change is obvious in the line's History tab. Nothing is
 * deleted: roll back from History at any time.
 *
 * Usage:
 *   pnpm profiles:publish WEB_DEVELOPMENT
 *   pnpm profiles:publish WEB_DEVELOPMENT --dry-run   # report what would change, write nothing
 *
 * Against production, run it with the production DATABASE_URL in the environment.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const LINES = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"] as const;
type Line = (typeof LINES)[number];

function fail(message: string): never {
  console.error(`error ${message}`);
  process.exit(1);
}

function parseLine(value: string | undefined): Line {
  if (value === undefined) fail(`no service line given. One of: ${LINES.join(", ")}`);
  const upper = value.toUpperCase().replace(/-/g, "_");
  const match = LINES.find((line) => line === upper);
  if (match === undefined) fail(`unknown service line "${value}". One of: ${LINES.join(", ")}`);
  return match;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const line = parseLine(args.find((arg) => !arg.startsWith("--")));

  const { db, toJsonInput } = await import("@/platform/db");
  const { DEFAULT_PROFILES } = await import("@/modules/acquisition/profiles/defaults");

  const author = await db.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (author === null) fail("no active ADMIN user to attribute the publish to.");

  const active = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line, isActive: true },
    select: { id: true, version: true, note: true },
  });
  const highest = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const nextVersion = (highest?.version ?? 0) + 1;
  console.warn(
    `${line}: active v${String(active?.version ?? 0)} → publishing v${String(nextVersion)} from the code default`,
  );
  if (active !== null) console.warn(`  current note: ${active.note ?? "(none)"}`);

  if (dryRun) {
    console.warn("dry run: nothing written.");
    return;
  }

  await db.$transaction(async (tx) => {
    if (active !== null) {
      await tx.serviceLineProfileVersion.update({
        where: { id: active.id },
        data: { isActive: false, status: "ARCHIVED" },
      });
    }
    await tx.serviceLineProfileVersion.create({
      data: {
        serviceLine: line,
        version: nextVersion,
        status: "PUBLISHED",
        isActive: true,
        profile: toJsonInput(DEFAULT_PROFILES[line]),
        note: "profiles:publish — published from the code default",
        createdById: author.id,
        publishedById: author.id,
        publishedAt: new Date(),
      },
    });
  });

  console.warn(`ok published v${String(nextVersion)} for ${line}.`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  });
