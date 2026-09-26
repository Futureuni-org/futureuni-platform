# tests/e2e/

**Owner: Phase 19 (Integration and orchestration).** Playwright end-to-end specs. Each phase writes its own specs in `tests/e2e/phase-<nn>/` (always allowed by the ownership guard); Phase 19 owns the cross-phase journeys and everything else here. Critical journeys carry the `@smoke` tag and run with `pnpm test:e2e --grep @smoke`.
