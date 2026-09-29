/**
 * `StorageAdapter` interface (Phase 6). Two implementations:
 *  - `vercel-blob` for production and previews (`@vercel/blob`)
 *  - `local` for development and tests (writes to `.storage/`, gitignored)
 *
 * The choice is made by `STORAGE_DRIVER` in the env.
 */

import "server-only";

export interface PutFileInput {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  access: "PRIVATE" | "PUBLIC";
}

export interface StorageAdapter {
  put(input: PutFileInput): Promise<{ url: string; size: number }>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  createUploadUrl(input: { key: string; contentType: string; access: "PRIVATE" | "PUBLIC" }): Promise<{ uploadUrl: string }>;
  read(key: string): Promise<Buffer>;
}
