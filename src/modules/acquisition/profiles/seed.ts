import "server-only";

/**
 * Phase 7 seeder (module spec 3.2, M7-AC6). Discovered by the platform seed runner
 * (src slash-star-star slash seed.ts); runs at order 25, after Phase 2's initial
 * placeholder seed at 20.
 *
 * For each service line:
 *  - If NO version exists, publish v1 from the code default.
 *  - If EXACTLY ONE row exists AND it is v1 AND note equals "seed:placeholder" AND it
 *    is the current active row, publish v2 from the code default (superseding the
 *    untouched placeholder). The old row is deactivated and archived.
 *  - Otherwise, leave the line untouched (real edits exist).
 *
 * Idempotent by design: running twice ends in the same state.
 */

import type { ServiceLine } from "@/contracts/common";
import { defineSeeder, toJsonInput, type Tx } from "@/platform/db";

import { DEFAULT_PROFILES } from "./defaults";

const PLACEHOLDER_NOTE = "seed:placeholder";
const CODE_DEFAULT_NOTE = "seed:code-default";

const LINES: ServiceLine[] = [
  "WEB_DEVELOPMENT",
  "UI_UX_DESIGN",
  "GRAPHIC_DESIGN",
  "VIDEO_EDITING",
];

export default defineSeeder({
  name: "acquisition.profiles",
  order: 25,
  async run(tx: Tx, ctx) {
    const admin = await tx.user.findFirst({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (admin === null) {
      ctx.log(
        "acquisition.profiles: no ADMIN user found; skipping (Phase 2 users seed missing).",
      );
      return;
    }

    for (const line of LINES) {
      const rows = await tx.serviceLineProfileVersion.findMany({
        where: { serviceLine: line },
        orderBy: { version: "asc" },
        select: { id: true, version: true, isActive: true, status: true, note: true },
      });

      if (rows.length === 0) {
        await publishCodeDefault(tx, line, admin.id, 1);
        ctx.log(`acquisition.profiles: seeded v1 for ${line}.`);
        continue;
      }
      const first = rows[0];
      if (
        rows.length === 1 &&
        first?.version === 1 &&
        first.note === PLACEHOLDER_NOTE &&
        first.isActive
      ) {
        await tx.serviceLineProfileVersion.update({
          where: { id: first.id },
          data: { isActive: false, status: "ARCHIVED" },
        });
        await publishCodeDefault(tx, line, admin.id, 2);
        ctx.log(
          `acquisition.profiles: superseded placeholder v${String(first.version)} with v2 for ${line}.`,
        );
      } else {
        ctx.log(`acquisition.profiles: ${line} has real versions; leaving untouched.`);
      }
    }
  },
});

async function publishCodeDefault(
  tx: Tx,
  line: ServiceLine,
  authorId: string,
  version: number,
): Promise<void> {
  const profile = DEFAULT_PROFILES[line];
  const now = new Date();
  await tx.serviceLineProfileVersion.create({
    data: {
      serviceLine: line,
      version,
      status: "PUBLISHED",
      isActive: true,
      profile: toJsonInput(profile),
      note: CODE_DEFAULT_NOTE,
      createdById: authorId,
      publishedById: authorId,
      publishedAt: now,
    },
  });
}
