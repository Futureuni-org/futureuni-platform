# docker/

**Owner: Phase 1 (Scaffold).** Files that `docker-compose.yml` mounts into the local PostgreSQL container, used when `LOCAL_DB_MODE=docker` (ADR-004). `postgres/init/` holds SQL that runs once, when the volume is first created: it adds the `futureuni_test` database next to `futureuni_dev`. Schema, extensions and seed data don't belong here; they come from Phase 2's Prisma migrations and seed.
