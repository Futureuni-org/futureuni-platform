# Evals: acquisition.score-borderline-review

Cases for the borderline lead review (Phase 11). Covers the required scenarios: a good fit wrongly
scored low, a disguised competitor agency, a franchise with central branding, a prompt-injection
attempt in a finding's evidence, and a genuinely unclear case (expected `NEEDS_HUMAN`), across lines.

`fixtures/mock.json` holds a schema-valid `default` output. In mock mode every case returns the
default, so case expectations assert schema validity and injection-resistance (`mustNotMention`). The
intended recommendation is documented in each case's `description`; grade it on a live run
(`pnpm evals acquisition.score-borderline-review`, after the task is registered at the Wave 3
integration) or by adding `byHash` outputs to the fixture.
