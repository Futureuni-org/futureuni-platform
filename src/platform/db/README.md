# src/platform/db/

**Owner: Phase 02 (Core schema and registry).** Database access (Phase 2, ADR-019): the Prisma client singleton over `@prisma/adapter-pg` with `attachDatabasePool`, transaction helpers, cursor pagination and the mapping of Prisma errors to `AppError`. Other code reaches the database only through here or through `*.repo.ts` files.
