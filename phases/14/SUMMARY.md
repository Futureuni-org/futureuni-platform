# Phase 14: Pipeline, meetings, proposals and won/lost: Summary

| | |
|---|---|
| Phase | 14, Pipeline, meetings, proposals and won/lost |
| Branch | `phase/14-pipeline` |
| Batch / wave | B4 / Wave 3 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-3/phase-14-pipeline.md` |
| Verification | `pnpm lint`: Pass · `pnpm typecheck`: Pass · `pnpm test` (pipeline, 41 tests): Pass · `pnpm build`: Pass (compiled successfully, 19/19 static pages) · `pnpm test:e2e`: Not run (no UI; Phase 16 builds the screens) · `saas-review`: no open Critical/Major |

## What was built

The acquisition pipeline back end (no UI): a **board by stage** with per-currency totals and moves that validate their payload (`M14-AC1`, `AC-32.1/.6`); **meetings** via a Cal.com calendar adapter with a signed-and-deduped webhook, manual meetings, owner reminders (24h/1h), an AI **pre-call brief** 2h before with the price range taken from the profile, and meeting outcomes/summaries (`M14-AC2/AC5`, `AC-33.1–.6`); **proposals** priced by a pure deterministic function in integer minor units, drafted by an AI task guarded by a number-consistency check (one repair then error), approved under a discount/range exception rule, rendered as a branded A4 PDF and sent through the outreach thread, then accepted/declined/expired (`M14-AC3`, `AC-34.1–.6`, `AC-37.3`); **won/lost** with a `Deal`, a capacity-based **handoff** (suggested owner per service, manager override, load recalculated, PDF + Markdown export) and structured loss reasons with re-engagement (`M14-AC4`, `AC-35.1–.4`); lead **notes with mentions** (`M14-AC7`); and the four **revenue data services** for Phase 17. All money is per currency and never summed (INV-11); prices are computed only in code (INV-17); placeholder portfolio is never attached (INV-19); every status change goes through `transitionLead` (INV-1/INV-15) and publishes `lead.statusChanged` after commit.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/pipeline/pipeline.repo.ts` | All Prisma access for the area (board, meetings, proposals, deals, handoff, notes, webhook dedupe, revenue aggregates). |
| `src/modules/acquisition/pipeline/_seams.ts` | Stand-ins for `SEAM-LEAD-BRIEF`, `SEAM-STOP-SEQUENCE`, `SEAM-SEND-ONEOFF` (deleted at integration, CR-14-02). |
| `src/modules/acquisition/pipeline/shared.ts` | `publishStatusChanged`, `notifySafe` (best-effort notifications). |
| `src/modules/acquisition/pipeline/profile-context.ts` | Profile-derived packages, price ranges, portfolio and catalogue (INV-17/INV-19). |
| `src/modules/acquisition/pipeline/board/board.ts` | `getPipeline`, `moveLead`, `setNextAction`, `getOverdueNextActions`, `nurtureLead`, `reengageLead`, `runStaleCheck`. |
| `src/modules/acquisition/pipeline/board/notes.ts` | `addLeadNote`, `listLeadNotes`. |
| `src/modules/acquisition/pipeline/meetings/meetings.ts` | `getBookingLink`, `createMeeting`, `handleCalendarBooking`, `recordMeetingOutcome`, `regeneratePrecallBrief`, `generateDuePrecallBriefs`, `sendDueMeetingReminders`. |
| `src/modules/acquisition/pipeline/meetings/booking-link.ts` | Signed `leadRef` token (`signLeadRef`/`verifyLeadRef`/`buildBookingUrl`). |
| `src/modules/acquisition/pipeline/meetings/calendar/{types,webhook,mock,index}.ts` | `CalendarProvider` adapter: Cal.com + mock, signature verify, payload parse, MOCKS selector. |
| `src/modules/acquisition/pipeline/proposals/pricing.ts` | Pure `priceProposal` + `effectiveDiscountBps`. |
| `src/modules/acquisition/pipeline/proposals/number-check.ts` | `checkNumbersConsistent`, `formatDocDate`. |
| `src/modules/acquisition/pipeline/proposals/proposals.ts` | `createProposal`, `reviseProposal`, `approveProposal`, `sendProposal`, `markProposalAccepted`, `markProposalDeclined`, `diffProposalVersions`, `expireProposals`. |
| `src/modules/acquisition/pipeline/proposals/pdf/{brand,fonts,proposal-pdf,render}.*` + `fonts/*.ttf` | Branded proposal PDF (ADR-022), bundled OFL brand fonts. |
| `src/modules/acquisition/pipeline/deals/{deals,capacity,handoff-content,handoff-pdf}.*` | `markWon`, `markLost`, `assignHandoff`, `acknowledgeHandoff`, `exportHandoff`, `releaseDueReengagements`. |
| `src/modules/acquisition/pipeline/revenue.ts` | `getRevenueSummary`, `getLossReasons`, `getMeetingStats`, `getStageConversion`. |
| `src/modules/acquisition/pipeline/{jobs,schedules,settings,notifications,tasks,index}.ts` | Manifest registration inputs + barrel. |
| `src/app/api/webhooks/calendar/[provider]/route.ts` | The calendar webhook (verify → dedupe → service). |
| `runtime-skills/acquisition/pipeline-{precall-brief,meeting-summary,proposal-draft}/SKILL.md` | AI task prompts. |
| `evals/acquisition/pipeline-*/` | 8 eval cases each + mock fixtures. |
| `phases/14/samples/proposal-{nigeria,uk}.pdf` | Rendered sample proposals (M14-AC6). |

## Public interfaces other phases can use

All services take the contract `Actor` and authorise with `assertActorCan`. Import from `@/modules/acquisition/pipeline`.

```ts
// Board (permission acquisition.pipeline.read / .move, acquisition.lead.update)
export function getPipeline(actor: Actor, q: PipelineQuery, clock?: Clock): Promise<PipelineBoard>;
export function moveLead(actor: Actor, leadId: string, input: MoveLeadInput, clock?: Clock): Promise<void>;
export function setNextAction(actor: Actor, leadId: string, input: { at: Date | null; note?: string | null }): Promise<void>;
export function getOverdueNextActions(actor: Actor, clock?: Clock): Promise<OverdueNextAction[]>;
export function nurtureLead(actor: Actor, leadId: string, input: { until: Date; note?: string | null }, clock?: Clock): Promise<void>;
export function reengageLead(actor: Actor, leadId: string, clock?: Clock): Promise<void>; // NURTURE → REPLIED
export function addLeadNote(actor: Actor, leadId: string, input: { body: string; mentions?: string[] }): Promise<{ noteId: string }>;
export function listLeadNotes(actor: Actor, leadId: string): Promise<NoteRow[]>;

// Meetings (acquisition.meeting.manage) — getBookingLink implements SEAM-BOOKING-LINK
export function getBookingLink(leadId: string, ownerId?: string): Promise<string>;
export function createMeeting(actor: Actor, leadId: string, input: CreateMeetingInput, clock?: Clock): Promise<{ meetingId: string }>;
export function recordMeetingOutcome(actor: Actor, meetingId: string, input: MeetingOutcomeInput, clock?: Clock): Promise<{ summarised: boolean }>;
export function regeneratePrecallBrief(actor: Actor, meetingId: string, clock?: Clock): Promise<{ generated: boolean }>;
export function handleCalendarBooking(booking: NormalizedBooking, resolveLeadRef: (ref: string) => string | null, clock?: Clock): Promise<WebhookOutcome>; // SYSTEM

// Proposals (acquisition.proposal.*). priceProposal is pure (no I/O).
export function priceProposal(input: PriceProposalInput): PricedProposal;
export function createProposal(actor: Actor, leadId: string, input: CreateProposalInput, clock?: Clock): Promise<ProposalResult>;
export function approveProposal(actor: Actor, proposalId: string): Promise<void>;
export function sendProposal(actor: Actor, proposalId: string, input: { contactId: string; message: string }, clock?: Clock): Promise<{ messageId: string }>;
export function markProposalAccepted(actor: Actor, proposalId: string): Promise<void>;
export function markProposalDeclined(actor: Actor, proposalId: string, input: { reason: string; keepOpen?: boolean }): Promise<void>;
export function reviseProposal(...): Promise<ProposalResult>;
export function diffProposalVersions(actor: Actor, proposalGroupId: string, from: number, to: number): Promise<ProposalVersionDiff>;

// Deals + handoff (acquisition.deal.close, acquisition.handoff.assign/acknowledge)
export function markWon(actor: Actor, leadId: string, input: MarkWonInput, clock?: Clock): Promise<{ dealId: string; handoffId: string }>;
export function markLost(actor: Actor, leadId: string, input: MarkLostInput, clock?: Clock): Promise<{ dealId: string }>;
export function assignHandoff(actor: Actor, handoffId: string, input: { serviceLine: ServiceLine; userId: string }, clock?: Clock): Promise<void>;
export function acknowledgeHandoff(actor: Actor, handoffId: string, clock?: Clock): Promise<void>;
export function exportHandoff(actor: Actor, handoffId: string): Promise<{ fileKey: string; markdown: string }>;

// Revenue data (acquisition.analytics.read) — for Phase 17
export function getRevenueSummary(actor: Actor, f: AnalyticsFilters): Promise<RevenueSummary>;
export function getLossReasons(actor: Actor, f: AnalyticsFilters): Promise<{ reason: string; count: number }[]>;
export function getMeetingStats(actor: Actor, f: AnalyticsFilters): Promise<MeetingStats>;
export function getStageConversion(actor: Actor, f: AnalyticsFilters): Promise<StageConversion[]>;
```

- **Jobs:** `acquisition.pipeline.{precall-brief,meeting-reminders,stale-check,proposal-expiry,reengage}` (`pipelineJobs`). **Schedules:** `pipelineSchedules`. **Settings:** `pipelineSettings` (CR-14-08). **AI tasks:** `acquisition.pipeline-{precall-brief,meeting-summary,proposal-draft}` (`pipelineTasks`; call `registerPipelineTasks()` in tests). **Notification types:** `pipelineNotificationTypes`. **Events emitted:** `meeting.booked`, `meeting.updated`, `proposal.sent`, `deal.won`, `deal.lost`, `handoff.created`, `lead.statusChanged`. **Route:** `POST /api/webhooks/calendar/[provider]`.

## Decisions made (and any new ADRs proposed)

- **Notifications are best-effort in the module** (`notifySafe`): a failed or (pre-integration) unregistered notification type never fails the business mutation (events contract rule 3). No ADR needed.
- **Capacity suggestion reads `TeamProfile` in `pipeline.repo.ts`** and uses the exported `recalculateLoad` from `@/platform/team` after assignment. The platform team barrel exposes no per-member list for a system actor; a future `@/platform/team` helper could own this (noted, not blocking).
- **The calendar provider abstracts only the webhook** (verify + parse); per-lead booking links are plain URLs with a signed `leadRef`, so there is no outbound Cal.com API call. The mock shares the real parse/verify (the webhook format is Cal.com's in every mode).
- No new ADRs proposed; the phase follows ADR-021 (Cal.com) and ADR-022 (`@react-pdf/renderer`), re-verified against current docs via Context7.

## Dependencies added

| Package | Version | Why |
|---|---|---|
| `@react-pdf/renderer` | ^4.9.0 | Branded proposal and handoff PDFs in Node (ADR-022). Default Next.js server external. |

Brand fonts (Bricolage Grotesque, Instrument Sans, JetBrains Mono) are bundled as OFL TrueType files under `proposals/pdf/fonts/` (source: Google Fonts `google/fonts`, OFL — see `fonts/OFL.txt`), not an npm dependency.

## Change requests raised

See `phases/14/REQUESTS.md`:
- **CR-14-01** (ownership/registration) — register `pipelineJobs/schedules/settings/tasks/notificationTypes` on the manifest from the leaf files.
- **CR-14-02** (seam wiring) — wire `SEAM-LEAD-BRIEF`, `SEAM-STOP-SEQUENCE`, `SEAM-SEND-ONEOFF`; delete `_seams.ts`.
- **CR-14-03** (seam provided) — `SEAM-BOOKING-LINK` = `getBookingLink`; consumers drop their stand-in.
- **CR-14-04** (dependency/deploy) — `@react-pdf/renderer`; bundle the PDF fonts on Vercel.
- **CR-14-05 / CR-14-06** (confirmations) — no schema/contract/permission changes needed.
- **CR-14-07** (doc/service) — optional router refinement to notify line owners on `deal.won/lost`.
- **CR-14-08** (settings) — the pipeline setting keys.
- **CR-14-09** (launch gate) — set `CALCOM_WEBHOOK_SECRET` before Cal.com goes live.

**Seams:** `SEAM-LEAD-BRIEF`, `SEAM-STOP-SEQUENCE`, `SEAM-SEND-ONEOFF` — **stubbed** (providers 11/12 ran in parallel; wiring in CR-14-02). `SEAM-BOOKING-LINK` — **provided** (real).

## Known limitations

- **Evals authored but not executed:** `pnpm evals` is blocked repo-wide by a pre-existing eval-runner `createContext` crash (noted in the Wave-2 integration summary). The 24 cases use `schemaValid` expectations against schema-valid `default` fixtures; the integration session should tune `exactMatch`/`byHash` and run them once the harness is unblocked.
- **PDF visual check:** both sample proposals render as valid PDFs (`phases/14/samples/`), but this environment has no `pdftoppm`/poppler to rasterise them, so the final on-brand visual confirmation (M14-AC6) is left for the owner to open the two files. The layout and figures are built deterministically from the computed quote and verified by the render test.
- **Pricing figures are profile placeholders** (`pricing.needsReview: true`, Prince to confirm; launch gate, Phase 21).
- `deal.won/lost` currently notify the owner and managers via the platform router; line-owner notification is CR-14-07.
- Booking links require `acquisition.bookingUrl`/`acquisition.defaultBookingUrl` to be set, or `getBookingLink` throws `PROVIDER_ERROR`.

## How to test it

- `pnpm check` — lint, typecheck, unit + integration tests, build.
- Unit tests (no DB): `pnpm exec vitest run src/modules/acquisition/pipeline/proposals/pricing.test.ts src/modules/acquisition/pipeline/proposals/number-check.test.ts src/modules/acquisition/pipeline/meetings/booking-link.test.ts src/modules/acquisition/pipeline/meetings/calendar/webhook.test.ts`.
- Integration (needs Postgres; `pnpm db:up`): `pnpm exec vitest run src/modules/acquisition/pipeline/pipeline.integration.test.ts src/modules/acquisition/pipeline/proposals/proposal-flow.integration.test.ts` — board per-currency totals, manual meeting + enrolment stop, won → handoff → load recalc, lost → re-engage → NURTURE, and create → approve → send → `PROPOSAL_SENT` with a rendered PDF.
- Regenerate the sample PDFs: `pnpm exec vitest run src/modules/acquisition/pipeline/proposals/pdf/samples.test.ts`, then open `phases/14/samples/proposal-nigeria.pdf` and `proposal-uk.pdf`.
- All services run in MOCKS mode (AI via fixtures, storage via the local driver, email via the `SEAM-SEND-ONEOFF` stand-in).
