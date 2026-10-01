# Scoring, qualification, briefs and capacity throttling (Phase 11)

Decides which audited leads deserve FUTUREUNI's time, and why.

- **`engine.ts`** — pure, deterministic `scoreLead`: evaluates the profile's scoring rules (a
  structured condition AST) over `ScoringFacts`, clamps to 0–100, returns itemised reasons and a band.
- **`facts.ts`** — `buildScoringFacts`: maps lead/company/contact/signal/finding rows (and the
  contactability verdict) into the flat facts the engine evaluates. Pure.
- **`outcome.ts`** — pure `decideOutcome`: channel check → disqualifiers → band → capacity, producing
  the target lead status. A borderline lead is never auto-disqualified.
- **`qualify.ts`** — `qualifyLead` orchestrates a scoring run (reads → score → decide → optional AI
  review → transaction: persist score, write `SCORE_CHANGE` history, `transitionLead`, emit
  `lead.scored`/`lead.statusChanged` → brief). Also `disqualifyLead` and `assignLead` (US-41).
- **`review.ts`** — `runBorderlineReview` (stores a `ScoreReview`), `acceptReview`, `overrideReview`.
- **`brief.ts`** — `generateBrief` (validated, one repair) and **`getLeadBrief`** (SEAM-LEAD-BRIEF).
- **`throttle.ts`** — **`getOutreachThrottle`** (SEAM-THROTTLE), `refreshLineCapacity` and the
  release of capacity-held leads; pure helpers `computeThrottleMode`, `effectiveDailyCap`,
  `lagosDayRange`.
- **`calibration.ts`** — `getScoreCalibrationData`: score bands × outcomes + override counts.
- **`services.ts`** — `getLeadScore`, `rescoreLead`, `getThrottleStatus` (UI reads/actions).
- **`actions.ts`** — server actions for the Phase 15–18 UI.
- **Registration bundles** (`jobs.ts`, `tasks.ts`, `settings.ts`, `schedules.ts`, `notifications.ts`,
  `subscribers.ts`) are wired onto the acquisition manifest at the Wave 3 integration
  (`phases/11/REQUESTS.md`). The AI skills live in `runtime-skills/acquisition/score-*/` and their
  evals in `evals/acquisition/score-*/`.

All lead-status changes go through `transitionLead`; database access is confined to `*.repo.ts`.
`getActiveProfile` is lazy-imported to avoid the manifest↔profiles import cycle.
