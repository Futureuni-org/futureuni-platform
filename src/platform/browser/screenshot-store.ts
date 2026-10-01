/**
 * Stores a capture's screenshot privately as compressed WebP through `@/platform/storage`
 * (purpose `AUDIT_SCREENSHOT`), applying a retention window (`docs/contracts/audit-agent.md` §4
 * rule 8). PNG/JPEG bytes are converted to WebP with `sharp` (lazy-imported so it never enters the
 * main app bundle); WebP bytes are stored as-is.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { putFile } from "@/platform/storage";

import type { RawScreenshot } from "./types";

const DEFAULT_RETENTION_DAYS = 90;
const WEBP_QUALITY = 72;

export interface StoreScreenshotOptions {
  /** Days the screenshot is kept before the retention purge removes it. Default 90. */
  retentionDays?: number;
  /** Owning module tag on the FileObject row (e.g. "acquisition"). */
  module?: string;
  /** Injectable clock for deterministic keys and retention in tests. */
  now?: () => Date;
}

/** Converts screenshot bytes to WebP (unless already WebP) and returns the raw WebP buffer. */
export async function toWebp(shot: RawScreenshot): Promise<Buffer> {
  if (shot.contentType === "image/webp") return Buffer.from(shot.bytes);
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(shot.bytes)).webp({ quality: WEBP_QUALITY }).toBuffer();
}

/**
 * Stores a screenshot and returns its `FileObject` key, to be used as an `AuditFinding.artifactKey`
 * or a `FindingEvidence.artifacts[].key`.
 */
export async function storeScreenshot(
  shot: RawScreenshot,
  opts: StoreScreenshotOptions = {},
): Promise<string> {
  const now = opts.now?.() ?? new Date();
  const webp = await toWebp(shot);
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const key = `audit-screenshots/${datePart}/${randomUUID()}.webp`;
  const retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const retentionUntil = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

  const stored = await putFile({
    key,
    body: webp,
    contentType: "image/webp",
    access: "PRIVATE",
    purpose: "AUDIT_SCREENSHOT",
    retentionUntil,
    ...(opts.module === undefined ? {} : { module: opts.module }),
  });
  return stored.key;
}
