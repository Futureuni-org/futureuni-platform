# tests/setup/

**Owner: Phase 01 (Scaffold).** Vitest setup files (Phase 1): `test-env.ts` gives every test a complete, valid environment; `msw.ts` and `msw-server.ts` start an MSW server that fails any request without a handler (no real network in tests); `dom.ts` adds the jest-dom matchers and cleanup for the `dom` project. `server-only-stub.ts` stands in for the `server-only` package, and `jest-dom-vitest.d.ts` restores the jest-dom matcher types under Vitest 5.
