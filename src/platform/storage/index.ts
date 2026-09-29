/**
 * @/platform/storage: file storage behind a `StorageAdapter`. Every file gets a `FileObject` row.
 */

import "server-only";

export { createUploadUrl, deleteFile, getSignedUrl, putFile, readFile, type PutFileInput } from "./service";
export { blobAdapter } from "./blob";
export { localAdapter } from "./local";
export type { StorageAdapter } from "./adapter";
