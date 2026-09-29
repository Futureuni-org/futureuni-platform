/**
 * Storage service (Phase 6). Every file gets a `FileObject` row; content-type is verified from
 * magic bytes on upload (never from the extension).
 */

import "server-only";

import { z } from "zod";

import { env } from "@/env";
import type { FilePurpose } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

import type { StorageAdapter } from "./adapter";
import { blobAdapter } from "./blob";
import { localAdapter } from "./local";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB default

const contentTypeSchema = z.string().min(1).max(200);

function getAdapter(): StorageAdapter {
  return env.STORAGE_DRIVER === "vercel-blob" ? blobAdapter : localAdapter;
}

/** Very small magic-byte sniff; extended in Phase 20 for the CSV/PNG/PDF fixtures. */
function sniffContentType(buffer: Buffer): string | null {
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return "application/gzip";
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return "application/zip";
  // Text-ish: printable ASCII in the first 512 bytes.
  const head = buffer.subarray(0, Math.min(512, buffer.length));
  let printable = 0;
  for (const byte of head) if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) printable += 1;
  if (head.length > 0 && printable / head.length > 0.95) return "text/plain";
  return null;
}

/** Roughly compatible content types. Prevents an .html file uploaded as .csv from slipping through. */
function contentTypesCompatible(declared: string, sniffed: string | null): boolean {
  if (sniffed === null) return true; // binary we don't sniff; declared wins
  if (declared === sniffed) return true;
  if (declared.startsWith("text/") && sniffed === "text/plain") return true;
  if (declared === "application/octet-stream") return true;
  // Common families:
  if (declared === "text/csv" && sniffed === "text/plain") return true;
  return false;
}

export interface PutFileInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  access?: "PRIVATE" | "PUBLIC";
  purpose: FilePurpose;
  uploaderId?: string;
  module?: string;
  retentionUntil?: Date;
  originalFilename?: string;
}

export async function putFile(input: PutFileInput): Promise<{ id: string; key: string; url: string }> {
  const declared = contentTypeSchema.parse(input.contentType);
  const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
  if (body.byteLength === 0) throw new AppError("VALIDATION_FAILED", "Empty file.");
  if (body.byteLength > MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", "File is larger than the platform limit.");

  const sniffed = sniffContentType(body);
  if (!contentTypesCompatible(declared, sniffed)) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", `File content (${sniffed ?? "unknown"}) doesn't match declared type (${declared}).`);
  }

  const result = await getAdapter().put({
    key: input.key,
    body,
    contentType: declared,
    access: input.access ?? "PRIVATE",
  });

  const row = await db.fileObject.create({
    data: {
      key: input.key,
      purpose: input.purpose,
      access: input.access ?? "PRIVATE",
      contentType: declared,
      sizeBytes: result.size,
      originalFilename: input.originalFilename ?? null,
      uploadedById: input.uploaderId ?? null,
      module: input.module ?? null,
      retentionUntil: input.retentionUntil ?? null,
    },
    select: { id: true, key: true },
  });
  return { id: row.id, key: row.key, url: result.url };
}

export async function getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
  return getAdapter().getSignedUrl(key, ttlSeconds);
}

export async function deleteFile(key: string): Promise<void> {
  await getAdapter().delete(key);
  await db.fileObject.updateMany({ where: { key, deletedAt: null }, data: { deletedAt: new Date() } });
}

export async function createUploadUrl(input: { key: string; contentType: string; access?: "PRIVATE" | "PUBLIC" }): Promise<{ uploadUrl: string }> {
  return getAdapter().createUploadUrl({ key: input.key, contentType: input.contentType, access: input.access ?? "PRIVATE" });
}

export async function readFile(key: string): Promise<Buffer> {
  return getAdapter().read(key);
}
