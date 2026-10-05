/**
 * Vercel Blob adapter (`@vercel/blob`). Files are stored private (INV-21): a signed URL is minted
 * on demand and expires, and the server reads bytes over its own store token. A caller that wants a
 * genuinely public object (brand assets) passes `access: "PUBLIC"`.
 *
 * NOTE (CR-16-STORAGE-PUBLIC): this closes the hole where "signed" URLs were the blob's permanent
 * public URL with a cosmetic `?exp=`. It is written against the installed @vercel/blob types and the
 * documented private flow, but it runs only with a real Blob store (local development uses the local
 * adapter), so it still needs verifying against a live store in Phase 20/21.
 */

import "server-only";

import { del, get, issueSignedToken, presignUrl, put } from "@vercel/blob";

import type { StorageAdapter } from "./adapter";

async function putFn(
  input: Parameters<StorageAdapter["put"]>[0],
): Promise<{ url: string; size: number }> {
  const body =
    typeof input.body === "string"
      ? Buffer.from(input.body, "utf8")
      : Buffer.isBuffer(input.body)
        ? input.body
        : Buffer.from(input.body);
  const result = await put(input.key, body, {
    // Private unless the caller explicitly wants a public object.
    access: input.access === "PUBLIC" ? "public" : "private",
    contentType: input.contentType,
    addRandomSuffix: false,
  });
  return { url: result.url, size: body.byteLength };
}

/** A URL that grants read access to a private blob until `ttlSeconds` from now, then stops working. */
async function getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
  const validUntil = Date.now() + Math.max(1, ttlSeconds) * 1000;
  const token = await issueSignedToken({ pathname: key, operations: ["get"], validUntil });
  const { presignedUrl } = await presignUrl(
    { clientSigningToken: token.clientSigningToken, delegationToken: token.delegationToken },
    { operation: "get", pathname: key, access: "private", validUntil },
  );
  return presignedUrl;
}

async function deleteFn(key: string): Promise<void> {
  await del(key);
}

function createUploadUrl(input: {
  key: string;
  contentType: string;
  access: "PRIVATE" | "PUBLIC";
}): Promise<{ uploadUrl: string }> {
  // Vercel Blob client uploads use a token endpoint that this adapter would provide. For now the
  // server accepts the upload directly; Phase 20 will switch to `createUploadUrl` from
  // `@vercel/blob/client` for large files.
  return Promise.reject(
    new Error(`Direct blob client uploads not implemented for "${input.key}"; use put() from the server.`),
  );
}

/** Reads a private blob's bytes over the server's own store token. */
async function readFn(key: string): Promise<Buffer> {
  const result = await get(key, { access: "private" });
  if (result === null) throw new Error(`Blob not found: ${key}`);
  if (result.statusCode !== 200) {
    throw new Error(`Failed to read blob ${key}: ${String(result.statusCode)}`);
  }
  const chunks: Uint8Array[] = [];
  const reader = result.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export const blobAdapter: StorageAdapter = {
  put: putFn,
  read: readFn,
  delete: deleteFn,
  getSignedUrl,
  createUploadUrl,
};
