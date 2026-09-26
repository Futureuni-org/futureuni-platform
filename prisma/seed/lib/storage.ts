/**
 * Seed files. Fixtures live in prisma/seed/fixtures/ and are copied into the local storage folder
 * at `.storage/<key>` (the layout of the local storage driver, which Phase 6 owns), so screenshot,
 * proposal and CSV FileObjects open in development.
 */

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const STORAGE_ROOT = join(REPO_ROOT, ".storage");

export const FIXTURE_FILES = {
  screenshotMobile: { file: "screenshot-mobile.png", contentType: "image/png" },
  screenshotDesktop: { file: "screenshot-desktop.png", contentType: "image/png" },
  proposalPdf: { file: "proposal.pdf", contentType: "application/pdf" },
  handoffPdf: { file: "handoff.pdf", contentType: "application/pdf" },
  importCsv: { file: "import.csv", contentType: "text/csv" },
} as const;
export type FixtureName = keyof typeof FIXTURE_FILES;

export interface FixtureInfo {
  contentType: string;
  sizeBytes: number;
  checksum: string;
  originalFilename: string;
}

const infoCache = new Map<FixtureName, FixtureInfo>();

/** The FileObject columns a fixture fills (size and SHA-256 read from the file). */
export function fixtureInfo(fixture: FixtureName): FixtureInfo {
  const cached = infoCache.get(fixture);
  if (cached !== undefined) return cached;
  const { file, contentType } = FIXTURE_FILES[fixture];
  const bytes = readFileSync(join(FIXTURES, file));
  const info = {
    contentType,
    sizeBytes: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    originalFilename: file,
  };
  infoCache.set(fixture, info);
  return info;
}

/** Copies a fixture to `.storage/<key>`, overwriting what's there. */
export function copyFixture(fixture: FixtureName, key: string): void {
  const target = join(STORAGE_ROOT, ...key.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(FIXTURES, FIXTURE_FILES[fixture].file), target);
}
