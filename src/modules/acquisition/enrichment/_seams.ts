// SEAM:SEAM-PROFILE
/**
 * Wave 2 stand-in for `getActiveProfile`/`listActiveProfiles` (`docs/prompts/wave-2/wave-2-prep-and-merge.md`
 * Part B2). Reads the active `ServiceLineProfileVersion` row for the given service line and
 * parses it with `ServiceLineProfileSchema` from `@/contracts/service-line-profile`.
 *
 * At merge, this file is deleted and callers re-point to `@/modules/acquisition/profiles`.
 */

import "server-only";

import type { ServiceLine } from "@/contracts/common";
import { ServiceLineProfileSchema, type ServiceLineProfile } from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

export async function getActiveProfile(line: ServiceLine): Promise<ServiceLineProfile> {
  const row = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line, isActive: true, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    select: { profile: true },
  });
  if (row === null) throw new AppError("NOT_FOUND", `No active profile for ${line}.`);
  return ServiceLineProfileSchema.parse(row.profile);
}

export async function listActiveProfiles(): Promise<ServiceLineProfile[]> {
  const rows = await db.serviceLineProfileVersion.findMany({
    where: { isActive: true, status: "PUBLISHED" },
    orderBy: [{ serviceLine: "asc" }, { version: "desc" }],
    distinct: ["serviceLine"],
    select: { profile: true },
  });
  return rows.map((row) => ServiceLineProfileSchema.parse(row.profile));
}
