# runtime-skills/acquisition/_references/

**Owner: Phase 07 (Service-line profiles and runtime FUTUREUNI knowledge).** The reference
bundle every acquisition AI task loads via `selectAcquisitionReferences({ serviceLine,
market })`.

## Files (fixed layout — Part B1 of wave-2 prep)

- `services-catalogue.md` — the four services with package names (no prices)
- `evidence-rules.md` — INV-5 citation format + phrasing rules for measured findings
- `lines/<line>.md` — one per line (web-development, ui-ux-design, graphic-design, video-editing)
- `markets/<market>.md` — nigeria + international

Each file starts with `<!-- version: 1 · last reviewed: YYYY-MM-DD -->`. Update the date
whenever the file changes.

Consumers (Phases 8, 9, 10, 12, 13, 14, 17) import `selectAcquisitionReferences` from
`@/modules/acquisition/profiles` and pass the resulting path list to their task's
`references` selector. Wave 2 phases declare each reference `optional: true` in their
task definitions until the Wave-2 integration flips them to required (Part C3.3).
