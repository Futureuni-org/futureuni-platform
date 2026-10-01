# Evals: acquisition.score-lead-brief

Cases for the lead brief (Phase 11): two per service line (a clear fit and a cross-sell-leading lead).
Each checks that the brief cites only real findings, invents no facts and reads for a non-technical
owner.

`fixtures/mock.json` holds a schema-valid `default` output (no citation markers, empty
`keyFindingIds`, so it always passes `assertClaimsCited` and `validateBrief`). Case expectations
assert schema validity and the absence of hype/guarantee language. Register the task at the Wave 3
integration to run `pnpm evals acquisition.score-lead-brief` live.
