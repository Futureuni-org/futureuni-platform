-- Runs once, when the Docker volume is first created (docker-compose.yml).
-- futureuni_dev comes from POSTGRES_DB; this adds the integration-test database.
-- Extensions (citext, pg_trgm) are created by Phase 2's init migration (ADR-019).
CREATE DATABASE futureuni_test;
