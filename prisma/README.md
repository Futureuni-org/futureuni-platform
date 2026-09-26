# prisma/

**Owner: Phase 02 (Core schema and registry).** The Prisma 7 schema, migrations and development seed (Phase 2, ADR-019). The multi-file schema lives in `prisma/schema/`, the migration URL (`DIRECT_URL`) is set in `prisma.config.ts` at the repository root, and the generated client goes to `src/generated/prisma` (gitignored). Only `src/platform/db/**`, `prisma/**` and `*.repo.ts` files may import the client.
