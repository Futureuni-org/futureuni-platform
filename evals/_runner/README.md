# evals/_runner/

**Owner: Phase 05 (AI service).** The eval runner behind `pnpm evals`.

## Commands

```bash
pnpm evals                                    # run every registered task's suite (mock)
pnpm evals platform.summarize-company         # one task, mock provider
pnpm evals platform.summarize-company --live  # one task, real API, honours EVALS_LIVE_MAX_USD
pnpm evals platform.summarize-company --version 3  # run against a specific PromptVersion
```

Reports land in `evals/reports/<task>-<timestamp>.json` (gitignored). Exit code is
`0` when every case passes; `1` otherwise.

## Case file shape

Each case is one JSON in `evals/<module>/<task>/cases/*.json`, validated by
`EvalCaseSchema` in `types.ts`.

```json
{
  "id": "01-baseline",
  "description": "Two clear signals; both must be cited.",
  "input": { "…": "…" },
  "expectations": {
    "schemaValid": true,
    "mustMention": ["Shopify"],
    "mustNotMention": ["HACKED"],
    "citedEvidenceIds": ["sig1…", "sig2…"],
    "bannedPhrases": ["cutting-edge"],
    "exactMatch": { "citedEvidenceIds.length": 2 },
    "rubric": "Optional LLM-judge rubric.",
    "rubricPassScore": 0.7
  }
}
```

## Mock vs. live

- **Mock (default, CI)** — the runner uses the mock provider (fixtures under
  `evals/<module>/<task>/fixtures/`). Runs in a few seconds. Catches broken
  schemas and missing fixtures.
- **Live (`--live`)** — the runner uses the real Anthropic API. `EVALS_LIVE_MAX_USD`
  (env, default 5) caps total spend; the runner refuses to start above the cap and
  stops early once the running cost reaches it.

## From `publishPromptVersion`

The eval runner is called by `@/platform/ai.publishPromptVersion` to gate publishes
against regressions. The service imports `runEvalSuiteForPublish(taskId)` from
`./run.ts` — same runner, but returning only the score and report key.
