# runtime-skills/platform/

**Owner: Phase 05 (AI service).** Runtime skill folders for platform-owned AI tasks
(ADR-007). Each subfolder is `<task-name>/` and mirrors the task's id after the
`platform.` module prefix — e.g. `platform/summarize-company/` for
`platform.summarize-company`.

Layout (per task):

```
runtime-skills/platform/<task-name>/
  SKILL.md          # task instructions the model receives
  references/*.md   # optional, selected at call time by the task's ReferenceSelector
  examples/*.json   # optional worked input → output pairs
```

Phase 5 ships two:

- `summarize-company/` — the worked-example task.
- `eval-judge/` — the LLM judge used by the eval runner for rubric cases.
