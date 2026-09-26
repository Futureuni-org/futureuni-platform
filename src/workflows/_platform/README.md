# src/workflows/_platform/

**Owner: Phase 06 (Platform services).** The platform's Vercel Workflow definitions (Phase 6): `"use workflow"` entries that hold orchestration only, with every side effect in a `"use step"` function, so a retry re-runs only the failed step (`docs/contracts/jobs.md` rule 4).
