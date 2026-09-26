# src/app/api/health/

**Owner: Phase 01 (Scaffold).** `GET /api/health` (Phase 1): `route.ts` returns `{ status, version, commit, mocks }` with `Cache-Control: no-store` and no secrets, and `route.test.ts` checks that. Phase 2 may add a database check through a change request. README.md files are ignored by Next.js routing.
