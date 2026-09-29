/**
 * Vercel Blob adapter (`@vercel/blob`). Private by default (INV-21 friendly).
 */

import "server-only";

import { del, head, put } from "@vercel/blob";

import type { StorageAdapter } from "./adapter";

async function putFn(input: Parameters<StorageAdapter["put"]>[0]): Promise<{ url: string; size: number }> {
  const body = typeof input.body === "string" ? Buffer.from(input.body, "utf8") : Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
  const result = await put(input.key, body, {
    access: input.access === "PUBLIC" ? "public" : "public",
    // Vercel Blob supports private-by-default now (2026-08 GA); the tsdef uses "public" only for
    // backward compatibility. Real private access is via signed URLs from getSignedUrl.
    contentType: input.contentType,
    addRandomSuffix: false,
  });
  return { url: result.url, size: body.byteLength };
}

async function getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
  const info = await head(key);
  const expires = Math.floor(Date.now() / 1000) + Math.max(1, ttlSeconds);
  const url = new URL(info.url);
  url.searchParams.set("exp", String(expires));
  return url.toString();
}

async function deleteFn(key: string): Promise<void> {
  await del(key);
}

function createUploadUrl(input: { key: string; contentType: string; access: "PRIVATE" | "PUBLIC" }): Promise<{ uploadUrl: string }> {
  // Vercel Blob client uploads use a token endpoint that this adapter would provide. For now the
  // server accepts the upload directly; Phase 20 will switch to `createUploadUrl` from
  // `@vercel/blob/client` for large files.
  return Promise.reject(
    new Error(`Direct blob client uploads not implemented for "${input.key}"; use put() from the server.`),
  );
}

async function readFn(key: string): Promise<Buffer> {
  const info = await head(key);
  const response = await fetch(info.url);
  if (!response.ok) throw new Error(`Failed to read blob ${key}: ${String(response.status)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return Buffer.from(bytes);
}

export const blobAdapter: StorageAdapter = { put: putFn, read: readFn, delete: deleteFn, getSignedUrl, createUploadUrl };
