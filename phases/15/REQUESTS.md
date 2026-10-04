# Phase 15 — Change requests

Applied at Wave 4 integration (B6). Phase 15 touched only its owned paths (`node scripts/ownership/check.mjs --phase-diff` is clean), so everything here is a request for another owner or the integration session. No schema or contract change is needed.

## Seams

- **SEAM-LINE-CONTEXT (provider).** Phase 15 provides the real implementation at
  `@/modules/acquisition/ui/shell` (`line-context.ts`): `resolveLine(slug)`, `lineHref(line, section?, query?)`,
  `LINE_SLUGS`. `accentToken` returns the `chart-{1,6,3,5}` token names — byte-identical to
  `--accent-{web,uiux,graphic,video}` and matching Phase 18's stand-in exactly. At B6 integration,
  repoint every consumer in Phases 16/17/18 from their `<ui>/_seams.ts` to this module and delete
  the stand-ins, then confirm `grep -r "SEAM:" src` is empty. Phase 15 stubbed no seams (every
  provider it calls — sourcing, outreach, scoring, compliance, audits, inbox, profiles, jobs, auth,
  storage — is already merged, so it calls the real code).

## Service gaps (worked around; raise with the owning phase)

- **CR-15-01 (outreach, Phase 12) — review-queue count.** There is no `countReviewQueue`. The
  Review section badge is derived from `getReviewQueue(..., { limit: 50 })` (shows `N+` when a
  further page exists). Add `countReviewQueue({ serviceLine, userId? })` for an exact, cheap count.
- **CR-15-02 (outreach, Phase 12) — review reads/filters.** There is no single-item reader
  (`getReviewItem(messageId)`) and `getReviewQueue` supports only `serviceLine | market | ownerId |
  needsHumanReview | complianceReview`. Phase 15 fetches the page and selects the focused item, and
  **post-filters channel and score range on the server** (`review/page.tsx`). Add a `channel`
  filter, a score range, and a single-item reader so the queue needn't over-fetch.
- **CR-15-03 (sourcing, Phase 8) — per-spec source plan.** `estimateSearchCost` doesn't return the
  `disabled` adapter list, and `resolvePlan` isn't exported. The search panel lists sources from
  `listAdapters()` filtered by `markets`/`supportedServiceLines`/`status`/`disabledReason`. Export
  `resolvePlan(spec, profile)` (or add `disabled[]` to the estimate) so the panel can show exactly
  which adapters this spec excludes and why.
- **CR-15-04 (sourcing, Phase 8) — ad-hoc run handle.** There is no wrapper to start an ad-hoc
  (non-saved) run and get the `SearchRun` id. Phase 15 enqueues `acquisition.sourcing.run` directly
  on `@/platform/jobs` and finds the run by matching `jobRunId` in `listSearchRuns`. A
  `startSearchRun(actor, spec): { runId }` would remove the match step and the first poll.
- **CR-15-05 (outreach, Phase 12) — richer draft surface.** `ReviewQueueItem` doesn't expose
  `humanEdited`, the validator's `uncitedSentences`, the signal citations, or the mailbox/number a
  send will use. Phase 15 re-checks length client-side and treats a dirty edit or `NEEDS_EDIT` as
  "needs confirmation". Surfacing those fields would let the queue flag uncited sentences precisely
  and show the sending mailbox.

## UI platform requests (Phases 1 / 4)

- **CR-15-06 — promote candidate primitives.** Built locally under `src/modules/acquisition/ui/`
  per B3.1; promote into `@/components/ui` if a second phase needs them: `SegmentedControl`,
  `Combobox`, `TagInput`, `LimitSlider` (slider), `Counter` (animated number), and, for review,
  `ScoreMeter` and `EvidenceChip`, plus the CSV `Stepper` pattern.
- **CR-15-07 — mount a `NuqsAdapter`.** B3.8 names nuqs for URL state, but no `NuqsAdapter` is
  mounted at the `(platform)` root and no merged phase uses nuqs. Phase 15 used native
  `useSearchParams` + `router.replace` and the merged `@/components/admin` URL helpers
  (`FilterBar`, `UrlSelect`), matching Phase 18. If the team wants nuqs, add the adapter in the
  Phase 4 root providers; Wave 4 can then adopt it uniformly.

## CR-15-08 — Critical pre-existing bug in Phase 4's shortcut/command registry (BLOCKS e2e)

**Owner: Phase 4 (`src/components/patterns/shortcuts.tsx`). I can't edit it on this branch (ownership guard).**

`useRegisteredShortcuts` and `useCommandRegistry` call `useSyncExternalStore` with an **uncached**
`getSnapshot` (`() => Array.from(registry.values())` / `Array.from(commandRegistry.values())`), which
returns a new array on every call. React then loops forever ("The result of getSnapshot should be
cached to avoid an infinite loop" → "Maximum update depth exceeded", React #185), tripping the
`(platform)` error boundary. The `CommandPalette` and `ShortcutsOverlay` are always mounted in the
TopBar and the shell registers its own shortcuts (⌘K, ?), so **every authenticated page loops** —
confirmed on `/` (home, which renders no Phase 15 code) as `web.lead@futureuni.local`. Phase 4's
smoke test missed it because the error boundary also renders an `<h1>`, satisfying its assertion.
This is independent of Phase 15 (my diff touches only my 59 owned paths; the shell is unchanged), so
it affects `main` too.

**Fix (cache the snapshot, rebuild only when the registry changes):**
```ts
// shortcut registry
let registrySnapshot: Registration[] = [];
function emit(): void { registrySnapshot = Array.from(registry.values()); for (const l of listeners) l(); }
export function useRegisteredShortcuts(): Registration[] {
  return useSyncExternalStore(subscribe, () => registrySnapshot, () => registrySnapshot);
}
// command registry — same pattern:
let commandSnapshot: Command[] = [];
// rebuild commandSnapshot = Array.from(commandRegistry.values()) wherever the map changes (useCommand set/cleanup, registerCommand), then notify
export function useCommandRegistry(): Command[] {
  return useSyncExternalStore(subscribeCommands, () => commandSnapshot, () => commandSnapshot);
}
```
Verified by diagnosis in dev (React named this exact cause). This must land for Phase 15's e2e and
visual review to pass; the Wave 4 integration session (runs on `main` with `FU_ALLOW_ALL`) can apply
it, or Phase 4's owner should.

## Notes

- **Capacity banner link (M15-AC2).** Implemented per the spec, which refines the phase prompt:
  `ADMIN`/`MANAGER` link to `/admin/team`; everyone else to
  `/acquisition/[line]/settings?section=overview`.
- **No new dependencies.** `croner` (cron preview) and `@axe-core/playwright` (axe in e2e) were
  already in `package.json`.
