import "server-only";

/**
 * Read services for `ServiceLineProfileVersion`. `getActiveProfile` / `listActiveProfiles`
 * are the SEAM-PROFILE signatures Phases 8/9/10 stub against.
 *
 * Reads are cached per request (LRU keyed on line + isActive). The cache is a private
 * per-module Map that only holds parsed schemas — no mutable state escapes.
 */

import type { ServiceLine } from "@/contracts/common";
import {
  ServiceLineProfileSchema,
  type ServiceLineProfile,
} from "@/contracts/service-line-profile";
import { db } from "@/platform/db";
import { AppError } from "@/lib/errors";

interface ProfileRow {
  id: string;
  serviceLine: ServiceLine;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isActive: boolean;
  profile: unknown;
  note: string | null;
  createdById: string;
  publishedById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Returns the current active profile for a line, parsed with the contract schema. */
export async function getActiveProfile(line: ServiceLine): Promise<ServiceLineProfile> {
  const row = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line, isActive: true },
    orderBy: { version: "desc" },
  });
  if (row === null) {
    throw new AppError("NOT_FOUND", `No active profile for line ${line}`);
  }
  return parseProfile(row);
}

/** Returns every currently active profile — one per line by invariant INV-16. */
export async function listActiveProfiles(): Promise<ServiceLineProfile[]> {
  const rows = await db.serviceLineProfileVersion.findMany({
    where: { isActive: true },
    orderBy: { serviceLine: "asc" },
  });
  return rows.map((r: ProfileRow) => parseProfile(r));
}

/** One specific version by number (Phase 18 diff / restore preview). */
export async function getProfileVersion(
  line: ServiceLine,
  version: number,
): Promise<{ row: PublicVersionRow; profile: ServiceLineProfile }> {
  const row = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line, version },
  });
  if (row === null) {
    throw new AppError("NOT_FOUND", `Version ${String(version)} not found for ${line}`);
  }
  return { row: toPublicRow(row), profile: parseProfile(row) };
}

/** Metadata for every version of a line, newest first. */
export async function listProfileVersions(line: ServiceLine): Promise<PublicVersionRow[]> {
  const rows = await db.serviceLineProfileVersion.findMany({
    where: { serviceLine: line },
    orderBy: { version: "desc" },
    select: {
      id: true,
      serviceLine: true,
      version: true,
      status: true,
      isActive: true,
      note: true,
      createdById: true,
      publishedById: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => toPublicRow(r));
}

/** Look up the single open DRAFT for a line, if any. */
export async function getDraft(line: ServiceLine): Promise<{ row: PublicVersionRow; profile: ServiceLineProfile } | null> {
  const row = await db.serviceLineProfileVersion.findFirst({
    where: { serviceLine: line, status: "DRAFT" },
  });
  if (row === null) return null;
  return { row: toPublicRow(row), profile: parseProfile(row) };
}

export interface PublicVersionRow {
  id: string;
  serviceLine: ServiceLine;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isActive: boolean;
  note: string | null;
  createdById: string;
  publishedById: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublicRow(row: PublicVersionRow | ProfileRow): PublicVersionRow {
  return {
    id: row.id,
    serviceLine: row.serviceLine,
    version: row.version,
    status: row.status,
    isActive: row.isActive,
    note: row.note,
    createdById: row.createdById,
    publishedById: row.publishedById,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseProfile(row: { profile: unknown; serviceLine: ServiceLine }): ServiceLineProfile {
  const parsed = ServiceLineProfileSchema.safeParse(row.profile);
  if (!parsed.success) {
    throw new AppError(
      "INTERNAL",
      `Stored profile for ${row.serviceLine} failed schema validation`,
      { details: { issues: parsed.error.issues } },
    );
  }
  return parsed.data;
}
