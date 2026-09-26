# evals/_runner/

**Owner: Phase 05 (AI service).** The eval runner behind `pnpm evals` (Phase 5). It runs each AI task's cases from `evals/<module>/<task>/` against the registered task definition, with mocks by default and a spend cap (`EVALS_LIVE_MAX_USD`) for live runs; generated reports go to `evals/reports/`, which is gitignored. The task contract is `docs/contracts/ai-service.md`.
