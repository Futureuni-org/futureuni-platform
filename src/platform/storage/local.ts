/**
 * Local storage adapter (development, tests). Writes to `<repoRoot>/.storage/<key>` and
 * gitignored. Signed URLs are HMAC-signed relative paths (`/api/dev/storage/...`). The dev route
 * itself lives outside this adapter; for tests, `read(key)` returns the bytes directly.
 */

import "server-only";

import { createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";

import { env } from "@/env";
import { AppError } from "@/lib/errors";

import type { StorageAdapter } from "./adapter";

const STORAGE_ROOT = join(process.cwd(), ".storage");

function assertSafeKey(key: string): void {
  if (key.length === 0) throw new AppError("VALIDATION_FAILED", "Empty storage key.");
  if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
    throw new AppError("VALIDATION_FAILED", "Storage key must be relative and free of ..");
  }
}

function pathFor(key: string): string {
  const parts = key.split("/").filter((s) => s.length > 0);
  return join(STORAGE_ROOT, ...parts);
}

async function put(input: Parameters<StorageAdapter["put"]>[0]): Promise<{ url: string; size: number }> {
  assertSafeKey(input.key);
  const target = pathFor(input.key);
  await mkdir(dirname(target), { recursive: true });
  const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
  await writeFile(target, body);
  const url = `/.storage/${input.key}`;
  return { url, size: body.byteLength };
}

async function readFn(key: string): Promise<Buffer> {
  assertSafeKey(key);
  return readFile(pathFor(key));
}

async function deleteFn(key: string): Promise<void> {
  assertSafeKey(key);
  await rm(pathFor(key), { force: true });
}

function getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
  assertSafeKey(key);
  const expires = Date.now() + Math.max(1, ttlSeconds) * 1000;
  const sig = signLocal(key, expires);
  return Promise.resolve(`/api/dev/storage/${key.replaceAll(sep, "/")}?exp=${String(expires)}&sig=${sig}`);
}

async function createUploadUrl(input: { key: string; contentType: string; access: "PRIVATE" | "PUBLIC" }): Promise<{ uploadUrl: string }> {
  // `contentType` and `access` are honoured by the actual Vercel Blob adapter; the local adapter
  // only needs to hand the caller a URL the dev route will accept.
  return { uploadUrl: await getSignedUrl(input.key, 600) };
}

function signLocal(key: string, expiresAtMs: number): string {
  const secret = env.CREDENTIALS_ENCRYPTION_KEY; // reused as a local HMAC seed; not a real secret in dev
  return createHmac("sha256", secret).update(`${key}\n${String(expiresAtMs)}`).digest("hex").slice(0, 32);
}

export const localAdapter: StorageAdapter = { put, read: readFn, delete: deleteFn, getSignedUrl, createUploadUrl };
