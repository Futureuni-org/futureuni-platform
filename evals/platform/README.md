# evals/platform/

**Owner: Phase 05 (AI service).** Eval suites for platform-owned AI tasks:

- `summarize-company/` — the worked-example task registered by Phase 5.
- `eval-judge/` — the LLM judge invoked by the runner for rubric cases.

Each folder has:

```
cases/*.json      # one case per file (see evals/_runner/README.md)
fixtures/*.json   # mock-provider outputs keyed on hash(input), plus a `default`
```

Run with `pnpm evals platform.summarize-company` (mock) or add `--live` for the
real API.
