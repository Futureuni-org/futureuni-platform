# Phase 11 — Change requests

Phase 11 (scoring, qualification, briefs, cross-sell, capacity throttling) touched only its own
owned paths. Everything below is applied at the Wave 3 integration (Part C3 of
`docs/prompts/wave-3/wave-3-prep-and-merge.md`).

## Summary

- **No schema change.** Phase 2 already provisioned every field and model this phase needs:
  `Lead.{score, scoreBand, scoreReasons, scoredAt, brief, keyFindingIds, suggestedAngleId,
  talkingPoints, briefGeneratedAt, needsHumanReview, crossSellGroupId, heldByCrossSell,
  nurtureReason, disqualifyReason}`, the `ScoreReview`, `CrossSellGroup` (with its one-active partial
  unique index `acq_cross_sell_groups_one_active_key`) and `LineCapacityState` models, and the enums
  `ScoreBand`, `NurtureReason`, `ReviewRecommendation`, `ReviewDecisionType`, `CapacityMode`,
  `CrossSellStatus`.
- **No core transition change.** `LEAD_TRANSITIONS` in `@/modules/acquisition/core` already allows
  every Phase 11 move: `AUDITED → SCORED | DISQUALIFIED | NURTURE`, `SCORED → NURTURE | DISQUALIFIED`,
  `NURTURE → SCORED` (guarded to `CAPACITY`/`COMPLIANCE` holds by `canTransition`) and
  `NURTURE → DISQUALIFIED`, plus the manual pre-contact `→ DISQUALIFIED` paths.
- **No contract change.** The events `lead.scored`, `lead.statusChanged`, `lead.assigned`,
  `crosssell.detected` and `capacity.mode.changed` already exist in `docs/contracts/events.ts`, and
  `ScoringFacts` / `Condition` / `ScoreReason` already exist in `service-line-profile.ts`.

## 1. Manifest registration (import each bundle from its own file, not the barrel)

Add to `src/modules/acquisition/manifest.ts` (mirrors how audits/sourcing are wired):

```ts
import { scoringJobs } from "./scoring/jobs";
import { scoringSettings } from "./scoring/settings";
import { scoringTasks } from "./scoring/tasks";
import { scoringSchedules } from "./scoring/schedules";
import { scoringNotificationTypes } from "./scoring/notifications";
import { scoringSubscribers } from "./scoring/subscribers";
```

- `jobs`: `...scoringJobs` — `acquisition.scoring.lead`, `acquisition.scoring.batch`,
  `acquisition.scoring.rescore-nightly`, `acquisition.crosssell.detect`, `acquisition.capacity.release`.
- `aiTasks`: `...scoringTasks` — `acquisition.score-borderline-review` (balanced),
  `acquisition.score-lead-brief` (fast).
- `settings`: `...scoringSettings` — `acquisition.throttle.slowAtPercent` (70),
  `acquisition.throttle.pauseAtPercent` (100), `acquisition.throttle.slowFactor` (0.3),
  `acquisition.firstTouchDailyCapPerLine` (30), `acquisition.scoring.rescoreAgeDays` (14).
- `schedules`: `...scoringSchedules` — `scoring-batch` (`*/10`), `scoring-rescore-nightly` (`0 2`),
  `crosssell-detect` (`*/15`), `capacity-release` (`*/10`), all `Africa/Lagos`. Record them in
  `docs/schedules.md` (Phase 19 owns that doc; M19-AC4 checks `getCronSchedules()`).
- `notificationTypes`: `...scoringNotificationTypes` — **new**: `crosssell.detected`,
  `capacity.line-released`. (`capacity.line-full` already exists platform-side; the notification
  router raises it from `capacity.mode.changed`, so Phase 11 only emits the event.)
- `subscribers`: `...scoringSubscribers` — re-score on `audit.completed`, `signal.recorded` and
  `compliance.verdict.changed` (pre-contact leads only), and detect cross-sell on `lead.scored`.

## 2. Permissions (already in the project-rules matrix; ensure they are on the manifest)

These actions are used by Phase 11 services and already appear in `.claude/project-rules.md`
§"Permission matrix". They must be registered in the acquisition manifest's `permissions` so
Phase 19's manifest-equals-matrix test (M19-AC4) passes:

- `acquisition.scoreReview.decide` (accept/override a borderline review; `OWN+A` for members)
- `acquisition.crossSell.manage` (set leading lead, split group)
- `acquisition.lead.disqualify`, `acquisition.lead.assign`, `acquisition.lead.rescore`

No new actions are introduced.

## 3. Seams provided (no stubs written by Phase 11)

Phase 11 **provides** these; consumers (12, 14) wrote the stubs. Delete those stubs and point them at:

- `SEAM-LEAD-BRIEF` → `getLeadBrief` from `@/modules/acquisition/scoring`.
- `SEAM-THROTTLE` → `getOutreachThrottle` from `@/modules/acquisition/scoring`.
- `SEAM-CROSSSELL` → `getCrossSellContext` from `@/modules/acquisition/crosssell`.

Each matches the Part B2 signature exactly (M11-AC7).

## 4. Evals

The suites exist with cases (`evals/acquisition/score-borderline-review/cases/*`,
`evals/acquisition/score-lead-brief/cases/*`) and schema-valid `default` mock fixtures. They register
and run at integration (`pnpm evals <taskId>` needs the task on the manifest). Case expectations are
satisfiable by the mock `default` (schema validity + injection-resistance via `mustNotMention`); the
recommendation-specific grading (QUALIFY/DISQUALIFY) is documented per case and is graded on a live
run or by adding `byHash` fixtures during integration.
