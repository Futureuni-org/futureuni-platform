# Phase 19 — Change-request index (REQUESTS-INDEX.md)

Every change request raised in `phases/*/REQUESTS.md` (phases 01–18), with its type, a one-line summary, its resolution status and the reason / files changed. Built at the start of Phase 19 (Stage 1) and kept current as requests are applied.

**Status legend**
- **APPLIED-EARLIER** — already applied during a wave/batch integration on `main`; recorded here, no Phase 19 action.
- **APPLY-NOW** — Phase 19 applies it (small / clearly-specified / needed for integration).
- **SERVICE-GAP→IMPL** — service gap feeding a count or an e2e journey; Phase 19 implements it at the root and switches the UI to it.
- **SERVICE-GAP→ROUTE** — service gap owned elsewhere and not integration-blocking; routed to the owning phase (recorded, not left open).
- **DECIDE** — implies a spec/schema/matrix decision; Phase 19 decides against the specs and records the decision.
- **REJECT** — conflicts with the specs/rules, or superseded; rejected with a written reason.
- **P21** — a launch/deploy gate; tracked for Phase 21, not actioned here.
- **NO-OP** — resolved as "no change needed / confirmation only" by the owning phase.

Summary: Phase 19 acts on the **APPLY-NOW**, **SERVICE-GAP→IMPL**, **DECIDE** and eval-runner rows (Stage 1 §"Act now"). Everything else is recorded as resolved (APPLIED-EARLIER / NO-OP), routed (SERVICE-GAP→ROUTE), rejected, or tracked for P21. **No request is left open.**

---

## Act now (Phase 19 work queue)

| ID | Type | Action |
|---|---|---|
| CR-05-05 | service-gap | Replace AI-budget `console.warn` with `events.publish('ai.budget.warning' / '.exceeded')`; types already registered. |
| CR-03-03 | service-gap | Publish `user.invited` / `user.roleChanged` / `user.deactivated` / `user.twoFactorReset` domain events. |
| CR-14-07 | service-gap | Notify SERVICE_LEAD line owners on `deal.won` / `deal.lost` (Phase 6 notification router mapping). |
| CR-17-05 | service-gap | Call `revalidateAnalytics()` from the relevant event handlers (exported, never called). |
| CR-02-21 | other | Pass `{ modules: await getEnabledModules() }` to registry getters at call sites so disabled modules stop contributing. |
| CR-06-06, CR-06-09 | doc | Add the platform.md §3.6/§3.8 retention note and the events.md §3a recipient-resolution sentence (verify, then write). |
| CR-12-03 | contract | Reconcile `tx: unknown` vs `Tx \| null` in the outreach-channel contract + implementers. |
| CR-10-05 | contract | Add `actor` / `jobRunId` / `configuredChecks` to `AuditContext` (optional, non-breaking). |
| CR-15-01/02/05 | service-gap→impl | `countReviewQueue`, review single-item reader, richer `ReviewQueueItem` draft surface (Phase 12 area). |
| CR-16-PIPELINE-TOTALS, -PIPELINE-FILTERS | service-gap→impl | Real per-currency board totals + server-side filters (Phase 14). |
| CR-16-INBOX-LIST, CR-16-SEND-OUTCOME | service-gap→impl | Inbox list/counts service; persisted send outcome. |
| CR-16-INBOX-SERVICE-GUARDS, -PIPELINE-SERVICE-GUARDS, -GAP-BOOKING-LINK-AUTH | service-gap→impl | Move UI-side authorization into the services. |
| CR-16-DEAL-RECLOSE, CR-16-LEAD-SUPPRESS, CR-16-UNMATCHED-SCOPE, CR-16-TOUCH-TARGETS | decide | Decide vs specs; record decision + any schema migration. |
| CR-08-02, CR-09-04, CR-11-04 | other | Fix the eval-runner crash, run `pnpm evals`, flip AI references optional→required where specified. |
| CR-07-03 | service-gap→impl | Home widgets → real acquisition service reads (Stage 4). |
| CR-10-02, CR-11-sched, CR-14-01 | schedule/doc | Reconcile + stagger schedules and write `docs/schedules.md` (Stage 2). |
| CR-15-06, CR-16-B3.1, CR-17-03, CR-18-promote | primitive-promotion | Evaluate promote-candidates; promote the clearly-shared ones into `@/components`, reject the rest with reason (Stage 5). |

---

## Phase 01 (doc/ADR/ownership — applied at Phase 1 merge)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-01-01 | ownership | Rewrite CLAUDE.md ownership map + grants | APPLIED-EARLIER | Phase 1 merge |
| CR-01-02 | doc | `@AGENTS.md` link in CLAUDE.md | APPLIED-EARLIER | Phase 1 merge |
| CR-01-03 | doc | ADR-035 toolchain pins | APPLIED-EARLIER | verified in `docs/decisions.md` |
| CR-01-04 | doc | ADR-003 Vercel Workflow facts | APPLIED-EARLIER (doc); actions **P21** | — |
| CR-01-05 | doc | ADR-024 Corepack/pnpm 11 + checklist | APPLIED-EARLIER (doc); checklist **P21** | — |
| CR-01-06 | doc | ADR-014 font var names | APPLIED-EARLIER | Phase 1 merge |
| CR-01-07 | doc | ADR-004 db:up wording | APPLIED-EARLIER | Phase 1 merge |
| CR-01-08 | doc | phases/README worktree wording | APPLIED-EARLIER | Phase 1 merge |
| CR-01-09 | doc | common.md Errors re-export note | APPLIED-EARLIER | Phase 1 merge |
| CR-01-10 | setting | `db:deploy` in project-rules | APPLIED-EARLIER | Phase 1 merge |
| CR-01-11 | other | Drop env requirement for vault-held keys once Phase 6 vault exists | P21 | deploy-config decision |

## Phase 02 (schema/contract/config — applied at Phase 2 merge)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-02-01..20, 22 | schema/contract/doc/config | LeadEvent.actorLabel, partial-unique Settings, FK indexes, money-ceiling note, contract fixes, CI registry/db steps, alias, partial-unique-index rule, Places location, script grants, lockfile-always-allowed, etc. | APPLIED-EARLIER | Phase 2 merge (CR-02-01 verified: `data-model.md` LeadEvent.actorLabel) |
| CR-02-21 | other | Advisory notes for later phases; incl. registry getters should take `{ modules: getEnabledModules() }` | APPLY-NOW | Apply the enabled-modules pattern to all getter call sites (Stage 1/2) |

## Phase 03 (from `wave-1-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-03-01 | seam | SEAM-AUTH-EMAIL → notifications | APPLIED-EARLIER | B1 |
| CR-03-02 | seam | SEAM-AUDIT → audit-log | APPLIED-EARLIER | B1 |
| CR-03-03 | service-gap | Publish `user.*` events | APPLY-NOW | no consumer yet; needed for audit-bridge/notifications completeness |
| CR-03-04 | setting | Settings-driven invite expiry / session length | DECIDE→REJECT (defer) | Not integration-blocking; constants acceptable per spec. Route to a future platform-settings pass; recorded, not left open |
| CR-03-05a | primitive/dep | `qrcode.react` for 2FA QR | DECIDE | Add only if the 2FA screen needs it at integration; else reject as owner-approval dep |
| CR-03-05 | setting/env | `AUTH_GOOGLE_ALLOWED_DOMAINS` env | P21 | auth hardening at go-live |
| CR-03-06 | ownership | Phase 18 restyle grant on `(auth)/**` | APPLIED-EARLIER | already in map; restyle in B5 |
| CR-03-07 | other | Optional argon2id | NO-OP | by design |
| CR-03-08 | doc | phase-01 e2e updated | APPLIED-EARLIER | Phase 3 |

## Phase 04 (from `batch-b2-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-04-01 | primitive/dep | design-system deps | APPLIED-EARLIER | B2 |
| CR-04-02 | ownership | Phase 4 alsoAllow package.json | APPLIED-EARLIER | B2 |
| CR-04-03 | doc/ADR | ADR-036 Editorial Ledger | REJECT | Owner (Prince) may promote; not a code/spec blocker. Recorded |
| CR-04-04 | doc | "How to build a screen" guide | NO-OP | lives in SUMMARY |
| CR-04-05 | setting/env | Remove `MOCK_SESSION_ROLE` | APPLIED-EARLIER | B2 |
| CR-04-06 | contract | Phase 7 widget registration | APPLIED-EARLIER | B2 |
| CR-04-07 | ownership | Record grants | APPLIED-EARLIER | B2 |

## Phase 05 (from `wave-1-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-05-01..04 | seam | AI credentials/settings/permission/audit seams | APPLIED-EARLIER | B1 |
| CR-05-05 | service-gap | Register budget notif types + replace `console.warn` with `events.publish` | APPLY-NOW | types done; event publish still stubbed (`src/platform/ai/**`) |
| CR-05-06 | dep | Optional `@anthropic-ai/sdk` bump | NO-OP | optional |
| CR-05-07 | dep | `sharp` for vision downscale | NO-OP | Phase 10 added sharp |
| CR-05-08 | doc | ADR-018 min cache prefix note | APPLY-NOW | small doc fix during docs reconciliation (Stage 5) |
| CR-05-09 | setting/env | Refresh model-id defaults in `.env.example` | APPLY-NOW | during docs/stack reconciliation (Stage 5) |
| CR-05-10 | other | Haiku 4.5 retirement watch | P21 | runbook |
| CR-05-11 | service-gap | Integration tests for runTask outcomes / prompt versioning | SERVICE-GAP→IMPL | add to Stage 6 integration tests |

## Phase 06 (from `wave-1-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-06-01 | config | vercel.json cron tick | APPLIED-EARLIER | B1 |
| CR-06-02 | contract | Core-manifest registrations | APPLIED-EARLIER | B1 |
| CR-06-03 | seam | SEAM-PERMISSION real | APPLIED-EARLIER | B1 |
| CR-06-04 | seam | Wire Phase 3/4/5 stand-ins | APPLIED-EARLIER | B1 |
| CR-06-05 | env | CRON_SECRET required | NO-OP | confirmed |
| CR-06-06 | doc | platform.md §3.6/§3.8 retention note | APPLY-NOW | verify + write (Stage 5) |
| CR-06-07 | ownership | `_seams` ownership | APPLIED-EARLIER | B1 |
| CR-06-08 | dev | `.storage/` gitignored | NO-OP | — |
| CR-06-09 | doc/contract | events.md §3a recipient-resolution sentence | APPLY-NOW | verify + write (Stage 5) |

## Phase 07 (from `batch-b2-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-07-01 | setting | `profiles:check` script | APPLIED-EARLIER | B2 |
| CR-07-02 | contract/manifest | Register profiles AI tasks/settings | APPLIED-EARLIER | B2 |
| CR-07-03 | service-gap | Real acquisition widget reads | SERVICE-GAP→IMPL | Stage 4 |
| CR-07-04 | service-gap | Phase 8 pricing/portfolio hydration on materialise | SERVICE-GAP→ROUTE | verify in Stage 6 journeys; if the materialise path already hydrates, NO-OP; else route to sourcing |
| CR-07-05 | seam | SEAM-PROFILE wiring | APPLIED-EARLIER | B2 |

## Phase 08 (from `wave-2-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-08-01 | manifest | Register sourcing | APPLIED-EARLIER | B3 |
| CR-08-02 | other | Flip AI refs required + run evals | APPLY-NOW | unblocked by eval-runner fix |
| CR-08-03 | seam | Seams real | NO-OP | — |
| CR-08-04/05 | schema/contract | No change | NO-OP | confirmed |
| CR-08-06 | service-gap | Credential `test()` for sourcing providers | SERVICE-GAP→ROUTE | admin-integrations nicety; route to Phase 18/admin backlog, not journey-blocking |
| CR-08-07 | other | registry.ts lint fix | APPLIED-EARLIER | B3 |
| CR-08-08 | env | Confirm `.env.example` provider keys | APPLY-NOW | verify during Stage 5 |
| CR-08-09 | other | Parallel test-isolation | APPLIED-EARLIER | B3 (`fileParallelism:false`) |

## Phase 09 (from `batch-b2` / `wave-2` summaries)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-09-01 | manifest | Register enrichment/compliance | APPLIED-EARLIER | B2 |
| CR-09-02 | seam | SEAM-PROFILE stand-in delete | APPLIED-EARLIER | B2 |
| CR-09-03 | seam | SEAM-SAFE-FETCH | APPLIED-EARLIER | B2/B3 |
| CR-09-04 | other | References required | APPLY-NOW | unblocked by eval-runner fix |
| CR-09-05 | other | Country-rules legal review before real cold email | P21 | launch gate |
| CR-09-06 | setting/env | `platform.crawlerContactUrl` before real crawl | P21 | launch gate |
| CR-09-07 | service-gap | Better Auth RateLimit rows accumulate in shared test DB | SERVICE-GAP→IMPL | fix test-DB reset to clear RateLimit (Stage 6 test infra) |

## Phase 10 (from `wave-2-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-10-01 | manifest | Register audits | APPLIED-EARLIER | B3 |
| CR-10-02 | schedule | Audit schedules + reconcile schedules.md | APPLY-NOW | Stage 2 (schedules.md) |
| CR-10-03 | setting | `platform.retention.screenshotsDays` default 90 | NO-OP | confirmed default |
| CR-10-04 | dep | sharp/@vercel/sandbox/playwright-core | APPLIED-EARLIER | B3 |
| CR-10-05 | contract | Add actor/jobRunId/configuredChecks to AuditContext | APPLY-NOW | optional, non-breaking (Stage 1) |
| CR-10-06 | other | registry.ts lint fix | APPLIED-EARLIER | B3 |

## Phase 11 (from `batch-b4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-11-01 | manifest | Register scoring (jobs/tasks/settings/schedules/notif/subscribers) | APPLIED-EARLIER | B4 |
| CR-11-02 | permission | Permissions on manifest | APPLIED-EARLIER | B4 |
| CR-11-03 | seam | Provides LEAD-BRIEF/THROTTLE/CROSSSELL | APPLIED-EARLIER | B4 |
| CR-11-04 | other | Evals | APPLY-NOW | unblocked by eval-runner fix |

## Phase 12 (from `batch-b4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-12-01 | manifest | Outreach wiring | APPLIED-EARLIER | B4 |
| CR-12-02 | seam | Connect consumed seams | APPLIED-EARLIER | B4 |
| CR-12-03 | contract | Reconcile `tx: unknown` vs `Tx\|null` | APPLY-NOW | contract tidy-up (Stage 1) |
| CR-12-04 | other | Bounce/unsubscribe cascade note | NO-OP | equivalent |
| CR-12-05 | dep | SMTP transport dependency + stub | P21 | go-live transport |

## Phase 13 (from `wave-3-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-13-01 | manifest | Inbox wiring | APPLIED-EARLIER | B5 |
| CR-13-02 | seam | Seams real | NO-OP | — |
| CR-13-03/04 | other | Company-scope stop / cascade notes | NO-OP | — |
| CR-13-05 | dep | IMAP transport dependency + stub | P21 | go-live transport |
| CR-13-06 | other | Inbound push webhook secret / Pub-Sub OIDC | P21 | launch gate |

## Phase 14 (from `batch-b4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-14-01 | manifest | Pipeline inputs | APPLIED-EARLIER | B4 |
| CR-14-02 | seam | Consumed seams | APPLIED-EARLIER | B4 |
| CR-14-03 | seam | Provides SEAM-BOOKING-LINK | APPLIED-EARLIER | B4 |
| CR-14-04 | dep | `@react-pdf/renderer` dep; font bundling on Vercel | dep APPLIED-EARLIER; fonts **P21** | B4 |
| CR-14-05/06 | schema/contract/perm | No change | NO-OP | confirmed |
| CR-14-07 | service-gap | Notify line owners on deal.won/lost | APPLY-NOW | Phase 6 router mapping (Stage 1) |
| CR-14-08 | setting | Pipeline settings keys; dedupe booking-url | APPLIED-EARLIER | B4 |
| CR-14-09 | other | Cal.com webhook secret | P21 | launch gate |

## Phase 15 (from `wave-4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| SEAM-LINE-CONTEXT | seam | Provide real line-context | APPLIED-EARLIER | B6 |
| CR-15-01 | service-gap | `countReviewQueue` (Phase 12) | SERVICE-GAP→IMPL | Stage 1/4 (count agreement) |
| CR-15-02 | service-gap | Review single-item reader + filters | SERVICE-GAP→IMPL | Stage 1 |
| CR-15-03 | service-gap | Export `resolvePlan` / disabled-adapter list (Phase 8) | SERVICE-GAP→ROUTE | search UI nicety; route to sourcing unless journey needs it |
| CR-15-04 | service-gap | `startSearchRun` handle (Phase 8) | SERVICE-GAP→IMPL | search journey start relies on it |
| CR-15-05 | service-gap | Richer `ReviewQueueItem` draft surface | SERVICE-GAP→IMPL | Stage 1 |
| CR-15-06 | primitive-promotion | Promote candidate primitives | DECIDE | Stage 5 promote-review |
| CR-15-07 | other | Mount `NuqsAdapter` | DECIDE | mount if any screen uses nuqs; else reject |
| CR-15-08 | other | Phase 4 shortcut/command getSnapshot infinite-loop fix | APPLIED-EARLIER | B6 |

## Phase 16 (from `wave-4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-16-SEAM-1 | seam | Line-context | APPLIED-EARLIER | B6 |
| CR-16-PROPOSAL-ATTACHMENT | service-gap | critical Phase 12 fix | APPLIED-EARLIER | B6 |
| CR-16-STORAGE-PUBLIC | service-gap | private-Blob flow | code APPLIED-EARLIER; live verify **P21** | B6 |
| CR-16-SHELL-SHORTCUTS | other | Phase 4 fix | APPLIED-EARLIER | B6 |
| CR-16-PIPELINE-TOTALS, -PIPELINE-FILTERS | service-gap | real totals/filters | SERVICE-GAP→IMPL | Stage 1/4 (board totals, count agreement) |
| CR-16-INBOX-LIST | service-gap | inbox list/counts | SERVICE-GAP→IMPL | Stage 1/4 |
| CR-16-SEND-OUTCOME | service-gap | persisted send outcome | SERVICE-GAP→IMPL | Stage 1 (journey assert) |
| CR-16-SET-PRIMARY | service-gap | set-primary audit + LeadEvent | SERVICE-GAP→IMPL | INV-1/INV-20 correctness |
| CR-16-INBOX-SERVICE-GUARDS, -PIPELINE-SERVICE-GUARDS | service-gap | auth in service not UI | SERVICE-GAP→IMPL | bans: server-side authz |
| CR-16-GAP-BOOKING-LINK-AUTH | service-gap | booking-link authz | SERVICE-GAP→IMPL | server-side authz |
| CR-16-CITATION-MARKERS | service-gap | send-path strips citation markers | SERVICE-GAP→IMPL | INV-5 correctness |
| CR-16-GAP-LEADS-LIST, -THREAD-FIELDS, -REGENERATE-DRAFT, -QUOTE-PREVIEW, -FINDING-EVIDENCE, -WHATSAPP-DRAFT | service-gap | richer readers / actions | SERVICE-GAP→ROUTE | interim repos work; route to owning phase (8/11/12/13/14). Re-point UI only if journey needs it |
| CR-16-SAVED-VIEWS, -BULK-JOBS, -BOARD-BOUNDS | service-gap | feature niceties | SERVICE-GAP→ROUTE | not spec-required for integration; routed |
| CR-16-DEAL-RECLOSE | decide/schema | re-close unique index | DECIDE | per data-model + INV-9; migration if needed |
| CR-16-LEAD-SUPPRESS | decide | matrix scope for lead suppress | DECIDE | per §Roles / permission matrix |
| CR-16-UNMATCHED-SCOPE | decide | inbox link scope (Phase 13) | DECIDE | per inbox spec |
| CR-16-TOUCH-TARGETS | decide | 48px targets (Phase 4) | DECIDE | per project-rules (48px mandatory); fix at root |
| CR-16-DIALOG-SCROLL, -AVATAR-LABEL, -RELATIVE-TIME, -ACTION-RETHROW | primitive | Phase 4/1 primitives | DECIDE | Stage 5 promote-review; fix at root if clearly shared |

## Phase 17 (from `wave-4-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-17-01 | seam | line-context + resolveLine bug | APPLIED-EARLIER | B6 |
| CR-17-02 | manifest/contract | Register analytics | APPLIED-EARLIER | B6 |
| CR-17-03 | primitive-promotion | Promote charts/csv/info-tooltip | DECIDE | Stage 5 promote-review |
| CR-17-04 | other | nuqs adapter | DECIDE | with CR-15-07 |
| CR-17-05 | service-gap | Wire `revalidateAnalytics()` to handlers | APPLY-NOW | exported, not called (Stage 1) |
| CR-17-06 | service-gap | Overview weekly-insight banner storage | DECIDE | decide storage vs. recompute; implement or reject with reason |
| CR-17-07 | other | Phase-DB seed gap (active profile version) | NO-OP | environmental; owner `db:reset` |

## Phase 18 (from `wave-3-integration/SUMMARY.md`)

| ID | Type | Summary | Status | Reason / files |
|---|---|---|---|---|
| CR-18-SEAM-1 | seam | line-context | APPLIED-EARLIER | B6 |
| CR-18-GAP-DSR-LIST, -SUPPRESSION-SEARCH, -LIST-INVITES, -MAILBOX-READERS, -SAMPLE-LEADS, -AI-METRICS, -EVAL-REPORT | service-gap | admin readers behind interim repos | SERVICE-GAP→ROUTE | interim repos work; route to owning phase. Re-point only if role-matrix journey needs it |
| CR-18-GAP-MODULE-TOGGLE, -SCHEDULE-TOGGLE | service-gap | admin toggles | SERVICE-GAP→IMPL | needed by `platform.module.toggle` / `platform.schedule.toggle` role-matrix tests |
| CR-18-GAP-DISCARD-DRAFT, -SELF-PROFILE, -SELF-SECURITY | service-gap | self-service actions | SERVICE-GAP→ROUTE | route; re-point if smoke/role journey needs it |
| CR-18-GAP-USER-DIGEST | setting | digest setting | SERVICE-GAP→ROUTE | not journey-blocking |
| CR-18-promote (Select/Field/ConfirmDialog/AdminTable/FilterBar/PasswordField) | primitive-promotion | promote to `@/components` | DECIDE | Stage 5 promote-review |

---

## Rejected (with reason)

- **CR-04-03** ADR-036 Editorial Ledger — owner-discretion documentation, not a code/spec requirement; left to Prince.
- **CR-03-04** settings-driven invite expiry/session length — current constants satisfy the spec; not integration-blocking. Noted for a future platform-settings pass.
- Any **SERVICE-GAP→ROUTE** feature that has no spec/journey requirement (saved views, bulk jobs, board bounds, assorted admin niceties) is **not implemented in Phase 19**; it is routed to its owning phase's backlog and recorded here, so nothing is "open" against Phase 19.

## Phase 21 gates (tracked, not actioned)

CR-01-04, CR-01-05, CR-01-11, CR-03-05, CR-05-10, CR-09-05, CR-09-06, CR-12-05, CR-13-05, CR-13-06, CR-14-04 (font bundling), CR-14-09, CR-16-STORAGE-PUBLIC (live-Blob verify).
