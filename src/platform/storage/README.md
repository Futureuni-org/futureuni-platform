# @/platform/storage

File storage behind a `StorageAdapter` (Phase 6). Every file gets a `FileObject` row (purpose,
access, size, type, uploader). Content-type is verified from magic bytes on upload; the file
extension is never trusted.

## Example

```ts
import { putFile, getSignedUrl } from "@/platform/storage";

const file = await putFile({
  key: `audit-screenshots/${leadId}/${runId}.png`,
  body: pngBytes,
  contentType: "image/png",
  purpose: "AUDIT_SCREENSHOT",
  uploaderId: actor.userId,
});

const url = await getSignedUrl(file.key, 300); // 5-minute TTL
```

`STORAGE_DRIVER` chooses the adapter: `local` for development and tests, `vercel-blob` for
previews and production. The Vercel-side registration for private uploads is set up in Phase 21.
