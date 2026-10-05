# Wave 4 integration (batch B6): Summary

| | |
|---|---|
| Batch / wave | B6 / Wave 4 (module UI) |
| Date | 2026-10-05 |
| Recipe | `docs/prompts/wave-4/wave-4-prep-and-merge.md` Part C3 (full integration, incl. connecting `SEAM-LINE-CONTEXT` in Phase 18's code); `phases/README.md` B6 row |
| Merged | `phase/15-module-shell` → `phase/16-leads-pipeline-inbox` → `phase/17-analytics` (merge order 15 → 16 → 17; merge commits `cf3cc98`, `79bef01`, `87d03e6`) |
| Verification | lint: Pass (0) · typecheck: Pass (0) · **build (`next build`): Pass** · tests: all affected suites Pass **on a clean DB** (see below) · the two real code defects found (resolveLine, batch-b1 test) are fixed and verified green on a fresh DB · **full `pnpm test` single-run + `pnpm test:e2e` + axe + visual pass: not completed here** (host memory + the shared `futureuni_test` needs a reset) |

## What was done

1. **Merged Phases 15, 16, 17** into `main` (`--no-ff`, order 15 → 16 → 17). Merge commits are in `git log main`. (Phase 18 was already on `main` from B5/Wave 3; its line-context seam was stubbed for B6.)
2. **Connected `SEAM-LINE-CONTEXT` everywhere and deleted the stand-ins.** All 12 consumers across Phases 16, 17 and 18 now import `resolveLine` / `lineHref` / `LINE_SLUGS` from the real provider `@/modules/acquisition/ui/shell` (Phase 15). Deleted `ui/leads/_seams.ts`, `ui/analytics/_seams.ts`, `ui/settings/_seams.ts`. `grep -r "SEAM:" src` is empty; 31 files import the shell provider. The two remaining `_seams.ts` (outreach, pipeline) are Wave-3 wired-adapter files with no markers.
3. **Registered Phase 17 on the acquisition manifest** (CR-17-02): `analyticsJobs`, `analyticsSchedules` (Mon 08:00 Africa/Lagos), `analyticsSettings` (`weeklyReportEnabled`, `lowSampleThreshold`), `analyticsTasks` (`acquisition.analytics-weekly-insight`) and `analyticsNotificationTypes` (`analytics.weekly-report`) — imported from the leaf files, not the barrel, to avoid the manifest↔registry cycle. `pnpm registry:gen` passes; the ownership duplicate check passes. The `analytics.weekly-report` row already exists in `docs/contracts/events.md` §3a.
4. **Applied Phase 16's deferred cross-phase fixes** (its REQUESTS, authorised for application at integration):
   - **CR-16-STORAGE-PUBLIC (Phase 6):** rewrote `src/platform/storage/blob.ts` to the documented `@vercel/blob` private flow (`put({access})`, `issueSignedToken` + `presignUrl` for expiring read URLs, `get(key,{access:"private"})` to read bytes), closing the hole where "signed" URLs were the blob's permanent public URL with a cosmetic `?exp=`. **Still needs verifying against a live Blob store (Phase 20/21)** — local dev uses the local adapter.
   - **CR-16-PROPOSAL-ATTACHMENT (Phase 12):** `outreach/email/email.repo.ts` now includes a message's `attachments` (filename + fileObject key/contentType) in the send include, and `outreach/email/send.ts` passes them to `buildOutboundEmail`. `buildOutboundEmail` already accepted an optional `attachments` list (default `[]`), so this is a no-op for attachment-less messages and wires proposal PDFs onto outbound email.
   - The Phase-4 shell fixes (shortcut/command `getSnapshot` caching, `OwnerAvatar` label) arrived on `main` with the Phase 15 merge.
5. **Fixed a real seam-wiring defect found by the merged tests (CR-17-01 step 4).** `resolveLine` in `ui/shell/line-context.ts` looked up the slug on a plain object built by `Object.fromEntries`, so an inherited key (`constructor`, `toString`, `__proto__`, …) resolved to a function off `Object.prototype` instead of `undefined` — returning a bogus line and 500ing every `[line]` route instead of 404ing. Added an `Object.hasOwn` guard. This is the cause of the only failure in a file this integration touched (`leads/export/route.integration.test.ts` → "answers 404 ... including an inherited object key"); fixed and verified green on a fresh DB.
6. **Fixed the carried-forward Wave-1 test defect.** `tests/integration/batch-b1-acceptance.test.ts` "core-manifest exposes platform jobs and schedules" checked every module's cron schedule against **platform-only** job names, so any acquisition schedule (e.g. `acquisition.scoring.batch`, present since Wave 3) failed it. Now checks each schedule's job against all enabled modules' jobs — the assertion the test's own comment describes. (Flagged as a pending fix in `phases/wave-3-integration/SUMMARY.md`.) Verified green on a fresh DB.
7. **Wrote the Wave 4 acceptance e2e** `tests/e2e/wave-4.spec.ts` (C3.3 route crawl: `manager` resolves overview + every line × section with no 404; C3.7 line-lead journey; M17-AC5 analytics drill-down → leads). Ready to run; not executed to completion here (OOM — see below).

## Verification detail and open items

- **lint (whole tree): Pass (0). typecheck (whole project): Pass (0). `next build`: Pass** — the integrated app compiles and every route, the manifest and the registry wire up.
- **Tests — proven on a clean database.** The full `pnpm test` against the shared `futureuni_test` showed 28 failures / 1297 passed. Diagnosed and re-run against a **fresh throwaway DB** (`futureuni_test_p99`, migrated clean): the previously-failing compliance, suppression, outreach, scoring, sourcing and wave-3-flow suites all **pass**, confirming they were **shared-DB contamination** (leftover `Sequence` rows → FK violation on profile cleanup; leftover `Suppression` rows → `BLOCKED` everywhere; a leftover `module.acquisition.enabled=false` platform setting → acquisition jobs absent; scoring/capacity per CR-17-07). The two defects that were **not** contamination (persisted on a fresh DB) were the two real bugs above — both now fixed and re-verified green in isolation (batch-b1 + wave-2-pipeline: 15 tests Pass on a fresh DB).
- **`wave-2-pipeline.test.ts`** fails only as a cross-suite artifact: its setup does a global `db.serviceLineProfileVersion.deleteMany({})` which FK-violates against `Sequence` rows left by other suites in a single shared DB. It passes in isolation on a fresh DB. Pre-existing test-isolation fragility, unrelated to the merged code.
- **Full single-run `pnpm test`, `pnpm test:e2e`, axe and the 375/1440 light/dark visual pass were not completed here.** `next build` succeeded, but the e2e run (prod server + Chromium) was reaped by the low-memory watchdog mid-first-test on this 7.8 GB host; a fully-green single `pnpm test` additionally needs a freshly reset `futureuni_test`, which Prisma blocks agents from doing. No failure observed is attributable to the integration code.

## To finish the gate (healthy environment)

Run with a fresh DB and enough free memory:

```
! pnpm db:reset        # Prisma blocks agent-initiated reset; run it yourself
pnpm check             # lint + typecheck + full test + build
pnpm test:e2e          # incl. tests/e2e/wave-4.spec.ts (crawl + journey + drill-down)
```

Then run the axe sweep and the 375/1440 light/dark visual consistency pass per role (C3.6/C3.8) once memory allows — these need a browser and were OOM-gated here.

## Follow-ups carried forward

- **Promote candidate primitives (C3.4 / CR-15-06 / CR-16-B3.1 / CR-17-03).** Deliberately **not** done here: merging two independently-built copies is a behaviour-affecting refactor of just-merged code, and the screens can't be visually diffed under the current memory limit — saas-review doctrine flags such refactors rather than auto-applying them. Concrete, now-actionable dedup (all copies on `main`): `ScoreMeter` (Phase 15 `ui/review/` + Phase 16 `ui/leads/`), `EvidenceChip` (same pair); `CurrencyInput`, `useUrlParams` and `LeadsTable`/`AdminTable`→`DataTable` (Phase 16 + Phase 18 copies); the analytics `csv.ts` (`toCsv`/`csvCell`) vs `src/platform/audit-log/service.ts`'s private copy → `@/lib`. A focused cleanup pass should promote these into `@/components` / `@/lib` and repoint, with a visual check.
- **CR-17-05 (cache invalidation):** `revalidateAnalytics()` is exported but not yet called from `deal.won`/`deal.lost`/`reply.received`/`lead.statusChanged`/`meeting.booked` handlers. Optional; wire for fresher dashboards than the 5-min TTL.
- **CR-17-06 (Overview weekly-insight banner):** deferred pending a decision on where the latest insight is stored (no schema table; settings are Phase-6-owned).
- **CR-15-01..05 service gaps (outreach/sourcing):** interim read paths stay until the owning phases add the exact readers requested.
- **`blob.ts` private flow** needs verifying against a live Vercel Blob store (Phase 20/21).
- `SEAM-LINE-CONTEXT` is fully connected; no seams remain in `src`.
