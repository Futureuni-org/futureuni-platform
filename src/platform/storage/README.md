# src/platform/storage/

**Owner: Phase 06 (Platform services).** File storage (Phase 6): Vercel Blob in deployed environments and a local driver writing to `.storage/` in development and tests. Every file gets a `FileObject` row, and type and size are validated on the server.
