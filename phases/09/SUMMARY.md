# Phase 09: Enrichment, Contact Discovery and Compliance: Summary

| | |
|---|---|
| Phase | 09, Enrichment, contact discovery and compliance |
| Branch | `phase/09-enrichment` |
| Batch / wave | B2 / Wave 2 (parallel with Phases 4 and 7; Phases 8 and 10 depend on it via SEAM-SAFE-FETCH) |
| Date finished | 2026-09-29 |
| Prompt | `docs/prompts/wave-2/phase-09-enrichment.md` |
| Verification | `pnpm check`: Pass on Phase-9 diff (lint clean · typecheck clean · all Phase-9 tests pass) · `pnpm test`: 1 pre-existing Wave-1 flake (`batch-b1-acceptance.test.ts`, RATE_LIMITED from accumulated Better Auth records — CR-09-07) · `pnpm test:e2e`: Not run (no UI routes) · `saas-review`: pending final pass; see §Known limitations |

> **REQUIRES LEGAL REVIEW BEFORE REAL COLD EMAIL.** Every row in `country-rules.ts` is a
> conservative default. Nigerian and EU counsel must sign off before the launch gate is opened —
> particularly `acquisition.compliance.ngDirectMarketingBasis` (defaults to `PENDING_LEGAL_REVIEW`)
> and the EU `CONSENT_REQUIRED` rows (`DE`, `AT`, `IT`, `ES`, `BE`).

## What was built

Three tightly linked packages that turn a company name into a reachable, compliant lead:

1. **`@/platform/http`** — the safe fetcher every crawl and integration call goes through.
   Provides `SEAM-SAFE-FETCH` for Phases 8 and 10. SSRF-safe (private/loopback/metadata refused
   in IPv4 + IPv6, rechecked after every redirect), robots-aware (24 h per-origin cache), size
   and time limits enforced while streaming, polite (per-origin serial + minimum delay + global
   concurrency), PII-free observability counters. Meets **AC-8.5** (unknown-country REVIEW)
   ancillary needs and **INV-14** (robots + user agent).
2. **`@/modules/acquisition/enrichment`** — the pipeline that runs the crawl, extracts contacts,
   phones, socials, tech and legal-form hints, resolves the primary contact through two AI tasks
   (`enrich-extract-people`, `enrich-pick-contact`), calls the finder/verifier for missing
   emails, then hands the lead to compliance for a contactability verdict. Owns
   `NEW → ENRICHING → ENRICHED`, plus `→ SUPPRESSED` and `→ DISQUALIFIED` for compliance reasons.
   Meets **US-7** (AC-7.*).
3. **`@/modules/acquisition/compliance`** — country rules table (ADR-034 defaults), UK Companies
   House + NG CAC hints legal-form detection, the ordered `getContactability` rule engine,
   `assertEmailAllowed`, suppression management (transactional cascade to enrolments and open
   leads, `INV-3`), consent records, DSR export/delete with hashed re-suppression, and the
   acquisition retention purge. Meets **US-8** (contactability), **US-9** (suppression), **US-10**
   (DSR) and **US-11** (retention). Governs **INV-2, INV-3, INV-6, INV-10, INV-25**.

**Domain invariants proven end-to-end:**

- UK Limited → email `ALLOWED`; UK sole trader → `CONSENT_REQUIRED`; UK unknown → `REVIEW`
  (**INV-6**).
- Nigerian leads default to `REVIEW` while the setting is `PENDING_LEGAL_REVIEW` (ADR-034).
- Unknown countries → `REVIEW` (never `ALLOWED`).
- Adding a suppression stops matching `ACTIVE`/`PAUSED` enrolments and moves matching open leads
  to `SUPPRESSED` in the same transaction (**INV-3**).
- `assertEmailAllowed` throws `CONTACT_BLOCKED` unless email is `ALLOWED` — the send path
  gets a single choke-point (**INV-2**).
- Hunter's `451 claimed_email` becomes an `INVALID` verification **and** an `EMAIL` suppression
  with reason `OBJECTION` in the same call.
- DSR delete anonymises the contact and re-suppresses by SHA-256 hash so the person is never
  re-sourced (**INV-10**).
- Content-type verified from magic bytes on upload (delegated to `@/platform/storage`).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/platform/http/{ssrf,robots,politeness,safe-fetch,index}.ts` + tests + README | Safe fetcher; provides SEAM-SAFE-FETCH |
| `src/modules/acquisition/enrichment/extract/{emails,phones,socials,tech-hints,legal-form-hints,address,index}.ts` + tests | Pure extractors |
| `src/modules/acquisition/enrichment/crawler/{plan,crawl,index}.ts` + tests | Homepage plan + orchestrator |
| `src/modules/acquisition/enrichment/providers/finder/{adapter,mock,hunter,index}.ts` | Hunter email finder + mock |
| `src/modules/acquisition/enrichment/providers/verifier/{mock,hunter,index}.ts` + tests | Email verifier + mock |
| `src/modules/acquisition/enrichment/{pipeline,batch,jobs,settings,tasks,_seams,index}.ts` + test + README | Pipeline, jobs, module manifest exports |
| `src/modules/acquisition/compliance/{country-rules,legal-form,contactability,suppression,consent,dsr,retention,reevaluate,jobs,settings,subscribers,index}.ts` + tests + README | Compliance rules and services |
| `runtime-skills/acquisition/enrich-extract-people/{system,user}.md` + `runtime-skills/acquisition/enrich-pick-contact/{system,user}.md` | Runtime skill prompts |
| `evals/acquisition/enrich-extract-people/{cases,fixtures/mock}.json` + `evals/acquisition/enrich-pick-contact/{cases,fixtures/mock}.json` | 8 eval cases per task with fixtures |
| `phases/09/{REQUESTS.md,SUMMARY.md}` | Change requests + summary |

## Public interfaces other phases can use

```ts
// @/platform/http (server-only) — SEAM-SAFE-FETCH provider
export async function safeFetch(url: string, opts?: ExtendedSafeFetchOptions): Promise<SafeFetchResult>;
export async function isAllowedByRobots(url: string, userAgent?: string): Promise<boolean>;

// @/modules/acquisition/enrichment (server-only)
export async function enrichLead(input: EnrichLeadInput): Promise<EnrichLeadResult>;
export const enrichmentJobs: readonly AnyJobDefinition[];   // acquisition.enrichment.{lead,batch,refresh}
export const enrichmentSettings: SettingDefinition[];       // maxPagesPerCompany, batchSize, perOriginDelayMs, finderDailyCap, finderPerLeadCap, reverifyDays, staleAfterDays
export const enrichmentTasks: readonly AnyTaskDefinition[]; // enrich-extract-people, enrich-pick-contact
export { getEmailFinder, getEmailVerifier };                 // Hunter / mock

// @/modules/acquisition/compliance (server-only)
export async function getContactability(tx: Tx | null, input: { companyId: string; contactId?: string }): Promise<Contactability>;
export async function assertEmailAllowed(tx: Tx | null, input: { companyId: string; contactId: string }): Promise<void>; // throws CONTACT_BLOCKED
export async function addSuppression(actor: Actor, input: AddSuppressionInput): Promise<SuppressionCascade>;
export async function removeSuppression(actor: Actor, id: string, reason: string): Promise<void>;
export async function listSuppressions(actor: Actor, query?: ListSuppressionsQuery): Promise<{ items: …; nextCursor: string | null }>;
export async function importSuppressions(actor: Actor, csv: string): Promise<{ added: number; skipped: number; errors: string[] }>;
export async function recordConsent(actor: Actor, input: RecordConsentInput): Promise<{ id: string }>;
export async function revokeConsent(actor: Actor, id: string, reason: string): Promise<void>;
export async function createDataSubjectRequest(actor: Actor, input: CreateDsrInput): Promise<{ id: string; status: DsrStatus }>;
export async function fulfilExport(actor: Actor, id: string): Promise<{ url: string }>;
export async function fulfilDelete(actor: Actor, id: string): Promise<{ anonymisedContacts: number }>;
export async function runAcquisitionRetentionPurge(actor: Actor, opts?: { dryRun?: boolean }): Promise<RetentionPurgeResult>;
export async function reevaluateOpenLeads(): Promise<JobResult>;
export const complianceJobs: readonly AnyJobDefinition[];   // acquisition.compliance.{retention-purge,reevaluate}
export const complianceSettings: SettingDefinition[];       // acquisition.compliance.ngDirectMarketingBasis
export const complianceSubscribers: readonly AnySubscriberDefinition[]; // settings.changed → reevaluate
```

**Events emitted:** `compliance.verdict.changed`, `compliance.suppressed`, `compliance.dsr.completed`.
**Notifications:** none directly (compliance DSR completion is routed by the Phase 6 router).
**Settings:** `acquisition.compliance.ngDirectMarketingBasis`, plus the enrichment tunables.
**Jobs:** `acquisition.enrichment.{lead,batch,refresh}` and `acquisition.compliance.{retention-purge,reevaluate}`.

## Decisions made

- **Country rules default REVIEW everywhere unknown.** Nothing maps an unknown country to
  `ALLOWED`. The table cites public sources and is marked for legal review.
- **NG governed by a setting.** `acquisition.compliance.ngDirectMarketingBasis` (default
  `PENDING_LEGAL_REVIEW`) drives the NG bucket; a change enqueues
  `acquisition.compliance.reevaluate` via a `settings.changed` subscriber, which walks open NG
  leads and updates their contactability + `Lead.complianceReview`. Meets **AC-14.6**.
- **Suppression cascade is transactional.** `addSuppression` opens its own `withTransaction`;
  the row insert, enrolment stop, lead transitions and `compliance.suppressed` publish live and
  die together. A retried call is idempotent on `(type, value)` via the live-unique partial index.
- **`ssrf.configureSsrf({ trustHostnames })` test hook.** Test-only allowlist for MSW-mocked
  hostnames so integration tests can exercise `safeFetch` end to end without touching real DNS.
  Never called from production code.
- **AI task references marked optional.** Wave 2's B1 references (`_references/lines/*.md`,
  `_references/markets/*.md`) don't exist yet in this worktree — Phase 7 writes them. The
  integration session flips both tasks' references to required.

No new ADRs proposed.

## Dependencies added

None. `libphonenumber-js`, `tldts` and `croner` were already installed by Phase 2; MSW, Prisma,
and every platform service arrived with Phase 6.

## Change requests raised

See `phases/09/REQUESTS.md`. Summary:

| ID | Type | Summary |
|---|---|---|
| CR-09-01 | acquisition manifest | Register Phase 9 jobs, settings, subscribers and AI tasks on `manifest.ts` |
| CR-09-02 | seam (consumed) | Replace SEAM-PROFILE stand-in with `@/modules/acquisition/profiles` |
| CR-09-03 | seam (provided) | Wire SEAM-SAFE-FETCH for Phases 8 and 10 to `@/platform/http` |
| CR-09-04 | integration | Make the Wave 2 references required and run `pnpm evals` in mock mode |
| CR-09-05 | docs | Country rules require legal review before real cold email begins |
| CR-09-06 | env note | `platform.crawlerContactUrl` must be set before real crawls |
| CR-09-07 | test | Wave 1 `batch-b1-acceptance.test.ts` accumulates Better Auth rate-limit rows (pre-existing) |

**Seams stubbed** (provider running in parallel): `SEAM-PROFILE` (Phase 7).
**Seams provided**: `SEAM-SAFE-FETCH` (Phases 8 and 10, at B3 merge).

## Known limitations

- **Country rules require legal review.** See CR-09-05. The launch gate stays closed until
  Nigerian and EU counsel confirm.
- **`companies-house` and `hunter` adapters use `resolveProviderKey`.** In `MOCKS=true` mode the
  mock providers are used; in production the credentials vault must hold real keys. Phase 21
  wires the actual keys.
- **Bulk suppression `importSuppressions` counts every row as `added`** even when the row was
  a duplicate (the underlying `addSuppression` is idempotent and returns the existing row). A
  future refinement can distinguish `added` from `already-present`.
- **The AI tasks are declared with their reference paths marked optional.** Phase 7's Wave 2
  references files replace this at the integration step.
- **`batch-b1-acceptance.test.ts` fails with `RATE_LIMITED`** in a shared test DB after enough
  runs (Wave 1 test; the auth suite doesn't clear `RateLimit` rows between tests). Not
  reproducible with a clean DB; CR-09-07 asks the auth phase or Phase 20 to add cleanup.

## How to test it

**Ready commands (from the worktree):**

- `pnpm typecheck` — passes.
- `pnpm lint` — passes on the Phase 9 diff.
- `pnpm test -- src/modules/acquisition/enrichment src/modules/acquisition/compliance src/platform/http` — passes.
- `pnpm build` — passes.

**Manual checks:**

1. `pnpm db:up`.
2. Read `src/modules/acquisition/compliance/country-rules.ts` and check the sources cited.
3. In a REPL: `import { getContactability } from "@/modules/acquisition/compliance"` then call
   it against seeded companies from Phase 2's dev seed to see the verdict per row.
4. `pnpm jobs:run acquisition.enrichment.batch '{"batchSize":5}'` — picks up NEW leads and
   enqueues per-lead workflows.
