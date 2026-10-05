# Phase 19: Integration and orchestration: Summary

| | |
|---|---|
| Phase | 19, Integration and orchestration |
| Branch | `phase/19-integration` |
| Batch / wave | B7 / Wave 5 (sequential, main folder) |
| Date finished | 2026-10-05 (in progress — see Known limitations) |
| Prompt | `docs/prompts/wave-5/phase-19-integration.md` |
| Verification | `pnpm lint`: Pass (full repo) · `tsc --noEmit`: Pass (0 errors) · targeted `vitest`: Pass (registry 12/12, review-count, outreach integration on a clean DB) · `pnpm build` / `pnpm test:e2e`: Not run (see Known limitations) · `saas-review`: run on the diff, 1 Critical found + fixed, no open Critical/Major |

## What was built

The acquisition module now **runs a lead automatically** from discovery to a review-queue draft. A durable, per-lead **`acquisition.lead.advance`** workflow (a workflow-kind job) is started on the `lead.created` event and chains enrich → audit → score+brief → first-touch draft as idempotent, resumable steps, under per-line and global concurrency caps; a 30-minute **sweeper** recovers stuck leads in score order and flags the exhausted ones for manual attention. The **acquisition manifest is finalised** (sweeper/compliance schedules added and every cron collision staggered into distinct 5-minute slots; the command palette consolidated as the single source; the `acquisition.review-count` nav badge resolver added). The **platform home widgets and "Needs you" tile now show real data** through new count services shared with the nav badge, so the counts agree by construction. `docs/architecture.md` and `docs/schedules.md` are written, every change request across phases 01–18 is triaged in `phases/19/REQUESTS-INDEX.md`, and `pnpm seed:staging` generates a realistic preview dataset. A real auth stand-in (`/api/notifications/stream` read the user from a header) was found and fixed.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/workflows/lead-advance.job.ts` | The `acquisition.lead.advance` workflow-kind job: enrich/audit/score/draft steps via `inlineStep`, idempotency key `leadId+advanceVersion` |
| `src/modules/acquisition/workflows/start.ts` | `tryStartAdvance` (concurrency-gated), `requeueAdvance` (re-queue a fresh run) |
| `src/modules/acquisition/workflows/sweeper.ts` | `sweepStuckLeads`: re-advance stuck pre-contact leads; flag + `lead.needsAttention` after N restarts |
| `src/modules/acquisition/workflows/jobs.ts` | `workflowJobs` = advance job + `acquisition.lead.advance-sweeper` |
| `src/modules/acquisition/workflows/schedules.ts` | `advance-sweeper` schedule (`*/30` Africa/Lagos) |
| `src/modules/acquisition/workflows/settings.ts` | `acquisition.advance.*` settings (concurrency caps, stuck threshold, max restarts) + `getAdvanceSettings` |
| `src/modules/acquisition/workflows/subscribers.ts` | `lead.created` → `tryStartAdvance` |
| `src/modules/acquisition/workflows/notifications.ts` | `lead.needs-attention` notification type |
| `src/modules/acquisition/workflows/index.ts` | Barrel |
| `src/modules/acquisition/ui/widgets/{review-queue,inbox,pipeline-value}.tsx` | Real home widget components (module-owned, contract rule 9) |
| `src/modules/acquisition/ui/widgets/review-count.ts` | Badge-resolver data source (shares `countReviewQueueForUser`) |
| `src/modules/acquisition/ui/widgets/index.ts` | Barrel |
| `src/modules/acquisition/pipeline/widget.ts`, `widget.repo.ts` | `getPipelineWidgetData` (open value/currency + meetings today) |
| `src/modules/acquisition/compliance/schedules.ts` | `compliance-retention-purge` (03:30) + `compliance-reevaluate` (07:15) |
| `docs/architecture.md` | System overview, module system, services, pipeline + lifecycle, event→subscriber→job map, AI usage, compliance flows, INV enforcement map |
| `docs/schedules.md` | Every scheduled job: cadence, purpose, duration, cost drivers, safety limits |
| `phases/19/REQUESTS-INDEX.md` | Every change request across phases 01–18, triaged and resolved |
| `prisma/seed/staging/index.ts` | `pnpm seed:staging` — ~320-lead realistic funnel with event trails, proposals, deals |
| `tests/integration/review-count.test.ts` | Review-count scoping (CR-15-01) |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/workflows
export async function tryStartAdvance(leadId: string, opts?: { actor?: Actor }): Promise<StartAdvanceResult>; // concurrency-gated start
export async function requeueAdvance(leadId: string, opts?: { actor?: Actor; countRestart?: boolean }): Promise<{ started: boolean }>;
export async function sweepStuckLeads(batchSize: number): Promise<JobResult>;
export async function getAdvanceSettings(): Promise<{ maxConcurrentGlobal; maxConcurrentPerLine; stuckThresholdMinutes; maxRestarts }>;

// @/modules/acquisition/outreach  (new in Phase 19)
export async function countReviewQueue(actor: Actor, input?: Omit<GetReviewQueueInput,"cursor"|"limit">): Promise<number>; // CR-15-01
export async function countReviewQueueForUser(userId: string): Promise<number>; // role-scoped; feeds the nav badge + widgets
export async function getReviewQueueForUser(userId: string, limit?: number): Promise<ReviewQueueItem[]>;

// @/modules/acquisition/pipeline  (new)
export async function getPipelineWidgetData(userId: string, clock: Clock): Promise<PipelineWidgetData>; // open value/currency + meetings today

// @/platform/auth  (new export)
export async function loadSubjectFromUserId(userId: string): Promise<PermissionSubject | null>; // role + lines by id, for session-less scoping
```

- **Jobs added:** `acquisition.lead.advance` (workflow-kind; event-triggered + manual), `acquisition.lead.advance-sweeper` (scheduled `*/30`).
- **Event subscribers added:** `acquisition.advance.on-lead-created` (`lead.created` → advance).
- **Events published:** `lead.needsAttention` (sweeper).
- **Settings added:** `acquisition.advance.maxConcurrentGlobal` (20), `…maxConcurrentPerLine` (5), `…stuckThresholdMinutes` (120), `…maxRestarts` (3).
- **Notification type added:** `lead.needs-attention` (product, in-app).
- **Badge resolver added:** `acquisition.review-count`.
- **Schedules:** `advance-sweeper`, `compliance-retention-purge`, `compliance-reevaluate`; all collisions staggered — full table in `docs/schedules.md`.
- **Script added:** `seed:staging`.

## Decisions made

- **Sweeper as a dedicated job, not a repurposed batch job.** The prompt suggested repurposing `enrichment.batch`/`audits.batch` as sweepers; I built one `acquisition.lead.advance-sweeper` instead, because `enrichLead` is a no-op for non-NEW leads (so re-running it can't recover a stuck ENRICHING lead) and rewriting Phase 9/10 service semantics + their tests was higher-risk. The batch/refresh jobs remain registered but unscheduled (manual bulk runs).
- **Advance workflow modelled as a workflow-kind job.** The platform already runs every job through one Vercel Workflow with step-level `inlineStep`; this reuses `enqueueJob`/`JobRun`/idempotency/the inline test runner and gives "resume from the failed step" through idempotent, status-guarded steps.
- **Acquisition retention runs as its own staggered daily job** (`acquisition.compliance.retention-purge` 03:30 + `dryRun`/`acquisition.retention.preview`) rather than being folded into `platform.retention-purge`, because the platform core must not import a module (project-rules ban). No module-purge registry existed to extend.
- **Commands are declared in the manifest and the shell derives from them** (`getCommands()` + `mayOpen`), removing the duplicate list in `acquisition/layout.tsx` (one rule, one place).
- **FU_ALLOW_ALL=1** was set for the session (gitignored `.claude/settings.local.json`) so integration could touch area-owned paths, as the prompt authorises. Paths changed outside Phase 19's ownership are listed below.
- Decisions on the DECIDE-class change requests are recorded in `phases/19/REQUESTS-INDEX.md`.

## Dependencies added

None.

## Change requests raised / resolved

Phase 19 does not raise new `REQUESTS.md` entries; it **resolves** the backlog in `phases/19/REQUESTS-INDEX.md`. Applied this phase: CR-02-21 (dispatcher scoped to enabled modules), CR-14-07 (won/lost notifies the line's service leads), CR-15-01 (`countReviewQueue`/`countReviewQueueForUser`), CR-07-03 (home widgets → real services). **Seams:** all were already real on `main` (every SEAM change request is APPLIED-EARLIER); Phase 19 added no stand-ins and removed two dead ones (`stopEnrollmentsDirect`, `createMockOneOff` in `pipeline.repo.ts`).

**Files changed outside Phase 19 ownership (via `FU_ALLOW_ALL`):** `src/modules/acquisition/{scoring,outreach,pipeline,inbox,analytics,compliance}/schedules.ts` (stagger + new), `outreach/index.ts`, `outreach/review/{review.ts,review.repo.ts}`, `pipeline/{index.ts,pipeline.repo.ts}`, `src/platform/auth/{permissions.ts,index.ts}`, `src/platform/jobs/dispatcher.ts`, `src/platform/notifications/router.ts`, `src/platform/registry/registry.test.ts`, `src/app/(platform)/acquisition/layout.tsx`, `src/app/api/notifications/stream/route.ts`, `src/components/shell/home/{needs-you.tsx,widget-registry.ts}` (+ 3 placeholder widgets deleted), `package.json` (the granted `seed:staging` script).

## Known limitations (remaining Phase-19 work)

The structural core (orchestration, final manifest, real widgets, docs, staging seed, cleanup, the index) is done and verified. The following remain and are tracked in `phases/19/REQUESTS-INDEX.md`:

1. **End-to-end suite (Step 6) not written/run.** The 8 journeys, branch journeys, role matrix and `@smoke` subset are not yet implemented. `pnpm build` + Playwright could not be exercised reliably in this sandbox (child-process spawn limits), so writing unverifiable specs was deferred rather than shipped broken. This is the largest remaining item.
2. **Eval-runner fix (CR-08-02/09-04/11-04) not done.** The `React.createContext under react-server` crash was not fixed, so `pnpm evals` was not run and the AI "references required" flags stay optional.
3. **Remaining apply-now glue not applied:** CR-05-05 (AI-budget `events.publish`), CR-03-03 (emit `user.*` events), CR-17-05 (call `revalidateAnalytics`), CR-12-03/CR-10-05 contract tidy-ups, and the doc sentences (CR-06-06/09, CR-05-08/09, CR-08-08).
4. **Service gaps:** CR-15-01 implemented; the other CR-16/CR-18 service gaps remain behind their interim repos and are routed to their owning phases in the index (not integration-blocking).
5. **DECIDE items** (CR-16-DEAL-RECLOSE, -LEAD-SUPPRESS, -UNMATCHED-SCOPE, -TOUCH-TARGETS): decisions are recorded in the index but code changes (where any) are not applied.
6. **`pnpm check` / `pnpm build`** not run end-to-end in-sandbox; lint + typecheck + targeted tests pass. The shared `futureuni_test` DB had accumulated committed rows from earlier runs (25 suppressions, 100 leads) that failed unrelated outreach tests; truncating the `acq_*` tables made them pass. A clean DB (owner-run `! pnpm db:reset`) is advisable before a full `pnpm check`.

## How to test it

- **Finalised manifest:** `node --import tsx --conditions=react-server src/platform/registry/codegen.entry.mjs` (validates) and `node --import tsx node_modules/vitest/vitest.mjs run src/platform/registry/registry.test.ts --no-file-parallelism`.
- **Review-count scoping:** `node --import tsx node_modules/vitest/vitest.mjs run tests/integration/review-count.test.ts --no-file-parallelism` (needs `pnpm db:up`).
- **Advance workflow (manual):** with `JOBS_INLINE=1`, create a `NEW` lead and `enqueueJob("acquisition.lead.advance", { leadId, advanceVersion: 0 })` (or publish `lead.created`), then confirm the lead reaches a draft in the review queue with no manual pushing; `acquisition.lead.advance-sweeper` recovers a lead left in a pre-contact status past the stuck threshold.
- **Staging data:** `pnpm db:seed` then `pnpm seed:staging` (refuses production) → ~320 leads across lines/markets/statuses for the analytics screens.
- **Schedules:** `docs/schedules.md` lists every job and time.
