# Phase 15: Module shell, search, saved searches and the review queue: Summary

| | |
|---|---|
| Phase | 15, Module shell, search, review |
| Branch | `phase/15-module-shell` |
| Batch / wave | B6 / Wave 4 (runs alongside 16, 17, 18) |
| Date finished | 2026-10-03 |
| Prompt | `docs/prompts/wave-4/phase-15-module-shell.md` |
| Verification | `pnpm lint`, `pnpm typecheck`, `pnpm build`: Pass · component tests: Pass (19 in 7 files) · `pnpm test:e2e tests/e2e/phase-15`: **14 passed** (desktop 1440 + mobile 375; axe clean on search & review in both themes) · Visual review: done (search & review at 1440/375, light/dark — correct, no overflow) · `saas-review`: 1 Critical + 1 Major found and fixed; no open Critical/Major · ownership `--phase-diff`: clean for Phase 15 paths (plus one authorised out-of-ownership shell fix, CR-15-08) |

## What was built

The front door of Client Acquisition and its two busiest screens. The **module shell** renders the service-line tab bar (four lines + Overview, hidden per role and line scope), each line's section navigation with live Review/Inbox/Pipeline-overdue badges, a capacity banner when a line is `SLOW`/`PAUSED`, the `/acquisition` and `/acquisition/[line]` redirects, and command-palette navigation; it also **provides `SEAM-LINE-CONTEXT`** exactly. **Search** is a focused tool: market toggle, location comboboxes, keyword tags, sources with disabled reasons, a limit slider, a live cost estimate with the budget-cap warning, **Run now** with a live run panel (per-source status, animated counters, leads arriving as they're created, retry-this-source), run history + run page, saved searches with a cron preview and the next three run times, a CSV import wizard with the required lawful-collection attestation, and manual add. The **review queue** has focus and list modes, citation highlighting (markers ↔ evidence chips, both ways), inline editing with per-channel length checks, AI assist streamed through an SSE route handler, the "every statement is true" confirmation that gates Approve after an edit, optimistic approve with rollback, reject/regenerate/snooze, the full keyboard set (`A E R G S J K O Y N`), assisted WhatsApp/LinkedIn/call flows, and borderline accept/override. Meets M15-AC1, AC2, AC4, AC7 in full; AC3/AC5/AC6 (US flows + axe) are covered by component tests now and by the written e2e specs once the DB is seeded.

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/ui/shell/line-context.ts` | SEAM-LINE-CONTEXT provider: `resolveLine`, `lineHref`, `LINE_SLUGS`, `lineLabel`, `lineAccentToken`, `REFRESH_BADGES_EVENT` (pure; client-safe) |
| `src/modules/acquisition/ui/shell/{sections,badges,line-tabs,section-nav,capacity-banner,commands,index}.ts(x)` | Section model, badge action, tab bar, section nav + polling badges, capacity banner, command registrar, barrel |
| `src/modules/acquisition/ui/search/**` | Search primitives (segmented control, combobox, tag input, limit slider, counter), panel + spec fields, cost estimate, run panel, saved-search form + list, CSV wizard + mapping, manual add, workspace, actions (`actions.ts`, `csv-actions.ts`, `cron-actions.ts`), `search-leads.repo.ts`, view/types |
| `src/modules/acquisition/ui/review/**` | Review queue, review card, context/evidence/draft panels, score meter, evidence chip, reject/override dialogs, assisted panel, list mode, flags, `actions.ts`, `review-context.repo.ts`, `draft-text.ts`, `safe-url.ts`, view |
| `src/app/(platform)/acquisition/{layout,page}.tsx` | Module frame (tabs + palette) and `/acquisition` redirect |
| `src/app/(platform)/acquisition/[line]/{layout,page}.tsx` | Line frame (identity + capacity + section nav) and `/acquisition/[line]` redirect |
| `src/app/(platform)/acquisition/[line]/search/{page,loading,error}.tsx`, `search/{saved,import,runs/[runId]}/page.tsx` | Search screens |
| `src/app/(platform)/acquisition/[line]/review/{page,loading,error}.tsx`, `review/draft-edit/route.ts` | Review screen + AI-assist SSE endpoint |
| `tests/e2e/phase-15/{shell-search,review}.spec.ts` | Playwright specs (desktop + mobile, axe) |
| `*.test.ts(x)` beside the code | 14 component tests |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/ui/shell — SEAM-LINE-CONTEXT (consumed by Phases 16/17/18)
export function resolveLine(slug: string): { line: ServiceLine; slug: string; label: string; accentToken: string } | null;
export function lineHref(line: ServiceLine, section?: string, query?: Record<string, string>): string;
export const LINE_SLUGS: Record<ServiceLine, string>;
// also: lineLabel, lineAccentToken, SECTIONS, getSectionBadges, LineTabs, SectionNav, CapacityBanner, CommandRegistrar, REFRESH_BADGES_EVENT
```

- `accentToken` is `chart-1|chart-6|chart-3|chart-5` (identical hex to `--accent-{web,uiux,graphic,video}`), matching Phase 18's stand-in so the B6 rewire is a drop-in.
- Route handler: `POST /acquisition/[line]/review/draft-edit` streams `streamDraftEdit` as SSE (gated by the service's `acquisition.message.draft`).
- No new jobs, events, settings, notification types or AI tasks were defined (presentation only).

## Decisions made

- **Client components import the shell's pure helpers from `@/modules/acquisition/ui/shell/line-context` directly**, not the barrel, so the `"use server"` badge action is never pulled into client bundles or tests.
- **URL state uses native `useSearchParams` + `router.replace` and the merged `@/components/admin` helpers** (`FilterBar`, `UrlSelect`), matching Phase 18, because no `NuqsAdapter` is mounted (raised as CR-15-07).
- **AI assist uses a route handler for SSE** rather than returning a stream from a server action; structured-output deltas are consumed and the validated `final` is applied with an undo.
- Run progress is polled via the acquisition `getSearchRun` (not `getJobRun`, which needs `platform.job.read` that leads/members lack); the ad-hoc run is matched by `jobRunId`.

## Dependencies added

None. `croner` (cron preview) and `@axe-core/playwright` (e2e axe) were already in `package.json`.

## Change requests raised

See `phases/15/REQUESTS.md`. Summary: SEAM-LINE-CONTEXT provider note (rewire at B6); service gaps CR-15-01 (`countReviewQueue`), CR-15-02 (`getReviewItem` + channel/score filters), CR-15-03 (export `resolvePlan`/disabled list), CR-15-04 (`startSearchRun` handle), CR-15-05 (richer `ReviewQueueItem`); UI platform CR-15-06 (promote local primitives), CR-15-07 (mount `NuqsAdapter`).

**Seams:** `SEAM-LINE-CONTEXT` — **provided** (real; Phase 15 owns it). All providers Phase 15 calls are merged, so **no seam was stubbed**.

## Authorised out-of-ownership fix (CR-15-08)

The e2e exposed a **pre-existing bug in the Phase 4 shell** that crashed every authenticated page
(including `/` home, which renders no Phase 15 code): `useRegisteredShortcuts`/`useCommandRegistry`
(`src/components/patterns/shortcuts.tsx`) and `useRecent` (`src/components/patterns/command-palette.tsx`)
called `useSyncExternalStore` with **uncached** snapshots (a new array every call → React #185
"Maximum update depth exceeded"). Phase 4's smoke test missed it because the error boundary also
renders an `<h1>`. With the owner's (Prince's) explicit consent, I cached each snapshot (rebuild only
on change) in those two Phase-4-owned files. Diagnosed via dev-server bisection; verified the loop is
gone and all e2e pass. This is documented in `phases/15/REQUESTS.md` CR-15-08; the ownership
`--phase-diff` will flag these two files (expected) — integration should keep the fix (ideally
re-homed to Phase 4).

## Visual review notes (B3.14)

Captured search and review at 1440 and 375 in light and dark as `web.lead` on seeded data. All read
correctly: line tabs with per-line accents, section nav with live badges (Review 3, Inbox 1), the
search panel, and the review focus card (queue rail, evidence chip with severity+method, score
meter, keyboard action bar). No horizontal overflow at 375; dark mode is layered navy, not an
inversion. Fixed during review: keyword seed no longer includes city names (location params are now
excluded in `deriveKeywords`).

## Known limitations

- **e2e run via a pre-built server.** Because this machine's cold `next build` exceeds Playwright's 300s webServer timeout, the e2e was run as `E2E_BASE_URL=http://localhost:4000 pnpm test:e2e tests/e2e/phase-15` against a server started separately (`MOCKS=true PORT=4000 pnpm start`). `pnpm test:e2e` with its own webServer should work on a faster machine / in CI. The sign-in specs wait for the URL to leave `/login` and retry the first mobile interaction (hydration can lag the first tap on the 375 project).
- **Uncited-sentence warning** is not shown per sentence because the validator's `uncitedSentences` detail isn't surfaced on `ReviewQueueItem` (CR-15-05); citation highlighting (markers ↔ chips) is fully implemented.
- **Review score/channel filters** are post-filtered on the server (the service lacks them, CR-15-02); the Review badge count is derived and shows `N+` past 50 (CR-15-01).
- Owner dropdown in the saved-search editor lists the current user only (a fuller line-owner list is a later nicety).

## How to test it

Prereqs: Postgres up (`pnpm db:up`), `.env.local` populated, then `! pnpm db:reset` (clean seed).

```bash
pnpm typecheck && pnpm lint && pnpm build          # all pass
pnpm vitest run src/modules/acquisition/ui          # 14 component tests pass
pnpm test:e2e                                        # after a clean seed
pnpm dev                                             # then, signed in as web.lead@futureuni.local:
#  /acquisition/web-development/search → set Lagos + Run now → live counters; Saved/Import/Add lead
#  /acquisition/web-development/review → J/K to move, E to edit (confirm gate), A to approve, WhatsApp send
#  Sign in as video.lead@futureuni.local, open /acquisition/web-development/review → no-permission state
```
