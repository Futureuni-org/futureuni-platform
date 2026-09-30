# Phase 09 change requests

Applied on `main` during the Batch B2 integration (`docs/prompts/wave-2/wave-2-prep-and-merge.md`
Part C3, and Wave 2's own integration session for the acquisition manifest wiring).

---

## CR-09-01 (acquisition manifest): Register Phase 9 jobs, subscribers, settings and AI tasks

Edit `src/modules/acquisition/manifest.ts` to include (Phase 19 is the manifest's owner; this
request is applied at the Wave 2 integration step, per wave-2-prep-and-merge Part C3 step 4):

- `jobs: [...enrichmentJobs, ...complianceJobs]` from `@/modules/acquisition/enrichment/jobs` and
  `@/modules/acquisition/compliance/jobs`.
- `settings: [...enrichmentSettings, ...complianceSettings]`.
- `subscribers: [...complianceSubscribers]`.
- `aiTasks: [...enrichmentTasks]`.

Reason: `docs/contracts/module-manifest.md` §Rules 7–8. Phase 9 does not own the manifest.

---

## CR-09-02 (seams): Replace SEAM-PROFILE stand-in with the real Phase 7 exports

At merge, delete `src/modules/acquisition/enrichment/_seams.ts` and re-point every import of
`getActiveProfile` / `listActiveProfiles` to `@/modules/acquisition/profiles`.

Files touching the seam:
- `src/modules/acquisition/enrichment/index.ts` (re-export).
- The two AI tasks read the profile lazily; nothing imports the seam directly outside `index.ts`.

The seam matches `docs/prompts/wave-2/wave-2-prep-and-merge.md` Part B2 signatures verbatim.

---

## CR-09-03 (SEAM-SAFE-FETCH provided): Wire Phases 8 and 10 stand-ins to `@/platform/http`

At merge, Phases 8 and 10 replace their `_seams.ts` stand-ins with imports of `safeFetch` and
`isAllowedByRobots` from `@/platform/http`. Signatures are the exact `SafeFetch` / `IsAllowedByRobots`
types in `src/contracts/enrichment.ts`.

---

## CR-09-04 (Part C3 step 3): Make the Wave 2 references required

The two enrichment AI tasks declare `runtime-skills/acquisition/_references/lines/*.md` and
`markets/*.md` as `optional: true`. The Wave 2 integration flips them to required (Phase 7 has
written the files by then) and runs `pnpm evals` in mock mode for every acquisition task.

---

## CR-09-05 (docs): Country rules require legal review before real cold email

`src/modules/acquisition/compliance/country-rules.ts` is marked "REQUIRES LEGAL REVIEW. NOT LEGAL
ADVICE." at the top. Phase 21's launch checklist gates the first real cold-email send on Nigerian
and EU counsel review of:

1. `acquisition.compliance.ngDirectMarketingBasis` — must move off `PENDING_LEGAL_REVIEW`.
2. The EU rows (`DE`, `AT`, `IT`, `ES`, `BE`) — default `CONSENT_REQUIRED` for every legal form.
3. `US`, `CA`, `IE`, `FR`, `NL` sole-trader / partnership defaults.

No code change here; the note reminds the launch gate.

---

## CR-09-06 (env note): `platform.crawlerContactUrl` must be set before crawling real sites

The safe fetcher builds its user agent as `FUTUREUNI-Bot/1.0 (+<platform.crawlerContactUrl>)`.
The launch checklist should require this setting is set to a public URL before any real crawl
happens (project-rules INV-14).

---

## CR-09-07 (pre-existing test): `tests/integration/batch-b1-acceptance.test.ts` accumulates Better Auth rate-limit rows

The Wave 1 acceptance test hits Better Auth's rate limiter multiple times per run. In a shared
test DB it fails intermittently with `RATE_LIMITED`. Phase 6 or Phase 20 should either:

- clear `RateLimit` rows in the test's `beforeEach`, or
- use a fresh Better Auth instance per test file (per the auth library docs), or
- widen the limiter's bucket for the test IP.

Not fixed by Phase 9 (out of ownership; the auth suite is Phase 3).

---

## Rejected: none.

## Notes for later phases

- **Phase 8** uses `SEAM-SAFE-FETCH` to reach source-adapter APIs. Real endpoints (Hunter,
  Companies House) should also go through `safeFetch({ respectRobots: false })` from Phase 9's
  own adapters — Phase 8's stand-in until merge is fine.
- **Phase 10** uses `SEAM-SAFE-FETCH` for the audit crawler; the same pattern applies.
- **Phase 12** (outreach send path) MUST call `assertEmailAllowed` in the same code path as the
  send (INV-2, INV-4, INV-6). Phase 9 exports it from `@/modules/acquisition/compliance`.
- **Phase 11** reads `Lead.complianceReview` (Phase 9 owns the flag). Phase 11 only reads it.
- **Phase 18** (admin UI) calls `listSuppressions`, `createDataSubjectRequest`, `fulfilExport`,
  `fulfilDelete`, `runAcquisitionRetentionPurge({ dryRun: true })`. Every service is permission-
  checked already via `assertActorCan`.
