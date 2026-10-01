# Phase 11: Scoring, qualification, briefs, cross-sell and capacity throttling: Summary

| | |
|---|---|
| Phase | 11, Scoring, qualification, briefs, cross-sell and capacity throttling |
| Branch | `phase/11-scoring` |
| Batch / wave | B4 / Wave 3 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-3/phase-11-scoring.md` |
| Verification | `pnpm lint`: Pass · `pnpm typecheck`: Pass · `pnpm test` (scoring+crosssell, 56): Pass · `pnpm build`: Pass (✓ Compiled successfully; one pre-existing Turbopack "dynamic filesystem access" warning from runtime-skill/fixture reads) · `pnpm test:e2e`: Not run (no UI in this phase) · `saas-review`: no open Critical/Major |

## What was built

Every `AUDITED` lead is now scored, explained and routed. A pure, deterministic engine evaluates the
profile's scoring rules (a structured condition AST) into a 0–100 score, itemised reasons and a band;
`qualifyLead` turns that into an outcome — qualify, disqualify (`no_channel`/`low_score`/`disqualifier:<id>`),
a compliance hold (`NURTURE(COMPLIANCE)`), a capacity hold (`NURTURE(CAPACITY)`) or a borderline case
that goes to `SCORED` for human review (never auto-disqualified). Borderline leads get a Claude second
opinion stored as a `ScoreReview`, which a human accepts or overrides (final, audited). Every scored
lead gets a short, cited brief; one company qualifying across lines becomes one `CrossSellGroup` with a
single leading lead and the rest held; and a per-line throttle slows and pauses new first touches by
capacity, releasing held leads when capacity frees. Meets M11-AC1…AC9 (AC-14.*, AC-15.*, AC-16.*,
AC-17.1/.2/.4, AC-18.1/.2/.4, AC-41.*). Score history, `lead.scored`, `getScoreCalibrationData`, and the
three provided seams are in place.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/scoring/engine.ts` | Pure `scoreLead`, condition-AST evaluator, bands |
| `src/modules/acquisition/scoring/facts.ts` | `buildScoringFacts` (rows → `ScoringFacts`) |
| `src/modules/acquisition/scoring/outcome.ts` | Pure `decideOutcome` (channel/disqualifier/band/capacity) |
| `src/modules/acquisition/scoring/qualify.ts` | `qualifyLead`, `disqualifyLead`, `assignLead` |
| `src/modules/acquisition/scoring/review.ts` | `runBorderlineReview`, `acceptReview`, `overrideReview` |
| `src/modules/acquisition/scoring/brief.ts` | `generateBrief`, `validateBrief`, **`getLeadBrief`** (SEAM-LEAD-BRIEF) |
| `src/modules/acquisition/scoring/throttle.ts` | **`getOutreachThrottle`** (SEAM-THROTTLE), capacity refresh/release |
| `src/modules/acquisition/scoring/calibration.ts` | `getScoreCalibrationData` |
| `src/modules/acquisition/scoring/services.ts` | `getLeadScore`, `rescoreLead`, `getThrottleStatus` |
| `src/modules/acquisition/scoring/actions.ts` | Server actions for the Phase 15–18 UI |
| `src/modules/acquisition/scoring/{scoring,throttle,review,calibration}.repo.ts` | Database access |
| `src/modules/acquisition/scoring/{jobs,tasks,settings,schedules,notifications,subscribers}.ts` | Manifest registration bundles |
| `src/modules/acquisition/scoring/{config,index}.ts` | Defensive settings reads; barrel |
| `src/modules/acquisition/crosssell/{detect,services,crosssell.repo,index}.ts` | Detection, **`getCrossSellContext`** (SEAM-CROSSSELL), management |
| `runtime-skills/acquisition/score-{borderline-review,lead-brief}/SKILL.md` | AI task prompts |
| `evals/acquisition/score-{borderline-review,lead-brief}/**` | Eval cases + mock fixtures |
| `src/modules/acquisition/scoring/*.test.ts`, `qualify.integration.test.ts`, `crosssell/detect.test.ts` | 56 tests |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/scoring
export async function getLeadBrief(leadId: string): Promise<{ brief: string | null; keyFindingIds: string[]; suggestedAngleId: string | null; score: number | null; scoreReasons: { ruleId: string; points: number; label: string }[] }>; // SEAM-LEAD-BRIEF
export async function getOutreachThrottle(line: ServiceLine): Promise<{ mode: "NORMAL" | "SLOW" | "PAUSED"; newFirstTouchesToday: number; reason: string }>; // SEAM-THROTTLE
export async function qualifyLead(leadId: string, ctx: { actor: Actor; jobRunId?: string; clock?: Clock }): Promise<{ leadId: string; status: LeadStatus; score: number; band: ScoreBand; previousScore: number | null }>;
export async function disqualifyLead(actor: Actor, leadId: string, reason: string, opts?): Promise<void>; // acquisition.lead.disqualify
export async function assignLead(actor: Actor, leadId: string, ownerId: string): Promise<void>;         // acquisition.lead.assign, emits lead.assigned
export async function acceptReview(actor: Actor, leadId: string, opts?): Promise<void>;                 // acquisition.scoreReview.decide
export async function overrideReview(actor: Actor, leadId: string, decision: "QUALIFY" | "DISQUALIFY", note: string, opts?): Promise<void>; // acquisition.scoreReview.decide
export async function getLeadScore(leadId: string): Promise<LeadScoreView | null>;
export async function rescoreLead(actor: Actor, leadId: string): Promise<QualifyResult>;                // acquisition.lead.rescore
export async function getThrottleStatus(): Promise<ThrottleStatus[]>;
export async function getScoreCalibrationData(args: { line: ServiceLine; from: Date; to: Date }): Promise<ScoreCalibration>;
export function scoreLead(input): ScoreResult; // pure

// @/modules/acquisition/crosssell
export async function getCrossSellContext(leadId: string): Promise<{ groupId: string | null; isLeading: boolean; leadingLeadId: string | null; lines: ServiceLine[] }>; // SEAM-CROSSSELL
export async function setLeadingLead(actor: Actor, groupId: string, leadId: string): Promise<void>;     // acquisition.crossSell.manage
export async function splitGroup(actor: Actor, groupId: string, opts?): Promise<void>;                  // acquisition.crossSell.manage; CONFLICT if a thread is active
export async function listCrossSellOpportunities(filter): Promise<CrossSellOpportunity[]>;
export async function detectCrossSell(companyId: string, ctx: { actor: Actor; clock?: Clock }): Promise<DetectResult>;
```

- **Jobs:** `acquisition.scoring.lead|batch|rescore-nightly`, `acquisition.crosssell.detect`, `acquisition.capacity.release`.
- **Events emitted:** `lead.scored`, `lead.statusChanged`, `lead.assigned`, `crosssell.detected`, `capacity.mode.changed` (all pre-existing in the contract).
- **Subscribes to:** `audit.completed`, `signal.recorded`, `compliance.verdict.changed` (re-score, pre-contact only), `lead.scored` (cross-sell).
- **Settings:** `acquisition.throttle.{slowAtPercent,pauseAtPercent,slowFactor}`, `acquisition.firstTouchDailyCapPerLine`, `acquisition.scoring.rescoreAgeDays`.
- **Notification types (new):** `crosssell.detected`, `capacity.line-released` (`capacity.line-full` reused).
- **AI tasks:** `acquisition.score-borderline-review` (balanced), `acquisition.score-lead-brief` (fast).

## Decisions made (and any new ADRs proposed)

- **No schema, core-transition or contract changes.** Phase 2 pre-provisioned every field/model/enum, the core transition table already allows every Phase 11 move, and all events/types already exist. (See `phases/11/REQUESTS.md`.)
- `decideOutcome`, `scoreLead` and the throttle/leading-lead helpers are **pure**, split from the I/O so they are unit-testable; the engine has golden snapshots per line.
- `getActiveProfile`/`selectAcquisitionReferences` are reached off the deep profile modules (or lazily) to avoid the manifest↔profiles import cycle.
- Notification sends in detection/release are **best-effort** (caught) so a notify failure never undoes a committed group or release.
- No new ADR proposed.

## Dependencies added

None.

## Change requests raised

See `phases/11/REQUESTS.md`. All are integration wiring (type: registration): import `scoringJobs`,
`scoringTasks`, `scoringSettings`, `scoringSchedules`, `scoringNotificationTypes` and `scoringSubscribers`
onto the acquisition manifest (from their own files), register the two new notification types, and ensure
the five already-matrixed permission actions are on the manifest. No schema/contract/transition requests.

**Seams:** `SEAM-LEAD-BRIEF`, `SEAM-THROTTLE`, `SEAM-CROSSSELL` are **provided** here (no stubs written);
consumers (12, 14) wire their stand-ins to the real exports at integration.

## Known limitations

- Evals exist and pass in mock mode on schema validity + injection-resistance; the recommendation-level
  grading (QUALIFY/DISQUALIFY) is documented per case and runs live (or via `byHash` fixtures) at the
  Wave 3 integration, after the tasks are registered.
- Re-scoring a `CONTACTED` lead refreshes its score value only (no transition — never moves backwards).
- Lead briefs store the finding citations as `keyFindingIds`; inline markers are stripped before storage.

## How to test it

```bash
# in the worktree ../futureuni-platform-11-scoring
pnpm exec vitest run src/modules/acquisition/scoring src/modules/acquisition/crosssell   # 56 tests
pnpm lint && pnpm typecheck
pnpm check   # run to confirm the production build (needs enough free memory)
```

Unit tests cover the condition evaluator per atom type, clamping, band boundaries (39/40/60/61), golden
snapshots per line, the channel-check matrix, throttle thresholds and leading-lead selection. The
integration test (`qualify.integration.test.ts`, real test DB + mock AI + controlled clock) covers
`AUDITED → SCORED/DISQUALIFIED/NURTURE`, borderline → `ScoreReview` (never auto-DQ), a recorded override,
re-score on new signals, cross-sell holding the non-leading lead, `PAUSED → NURTURE(CAPACITY)` with
release back to `SCORED`, and the two permission failures.
