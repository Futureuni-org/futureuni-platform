# Phase 8: Sourcing Framework and Adapters

> **How to run this phase**
> 1. Wave 1 must be merged and integrated, and Part A of `wave-2-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 08 sourcing`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-08-sourcing.md and execute it. Plan first."**
>
> Wave 2. Runs in parallel with Phases 7, 9 and 10. Depends on Waves 0–1.

---

## Your role and the goal of this phase

You are building **how the platform finds businesses that need FUTUREUNI**. A team member opens a service-line tab and runs a search:

> "Web Development · Nigeria · Lagos · restaurants"

Your code then:

1. runs that line's configured source adapters
2. turns every result into a **signal with evidence**
3. matches or creates the company in the **shared directory** without duplicates
4. tags the market and country
5. creates a lead for this company, service line and market, unless one already exists or the company is suppressed or excluded
6. records exactly what happened in a `SearchRun`

It also supports **saved searches** that run on a schedule, and pause automatically when the line's team is at capacity.

**No UI.** Phase 15 builds the Search panel and the saved searches UI on your services.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (invariants 2, 10 and 14, and the bans: no purchased lists, no login-walled scraping, no LinkedIn automation) and `docs/decisions.md`
2. `docs/specs/module-acquisition.md`: the search, saved searches, markets and capacity sections
3. `docs/contracts/source-adapter.md` and `src/contracts/source-adapter.ts`: implement exactly
4. `docs/integrations.md`: every sourcing provider, with its terms notes
5. `@/platform/directory` (normalise, match, upsert), `@/modules/acquisition/core` (`transitionLead`, `isSuppressed`), `@/platform/jobs`, `@/platform/credentials` (`resolveProviderKey`), `@/platform/settings`, `@/platform/storage`, `@/platform/events`, `@/platform/team` (`isLineAtCapacity`), `@/platform/ai` and `@/platform/auth`. Read each README.
6. The Wave 2 guide: `SEAM-PROFILE`, `SEAM-SAFE-FETCH`, reference paths, exports and lifecycle ownership
7. `phases/*/SUMMARY.md` for every completed phase
8. The global skills `saas-api` (outbound calls, retries, SSRF, uploads), `saas-data` (transactions, batching), `saas-ai`, `saas-testing` and `saas-review`

**Verify the provider details yourself.** For each provider, check its current official docs **and terms of use** before building. Record the source URLs in `src/modules/acquisition/sourcing/adapters/<id>/README.md`. Check:

- the Google Places API (New): Text Search and Nearby Search, field masks and pricing per field tier, **and the Google Maps Platform terms on storing and caching Places content**
- SerpAPI's Google Jobs engine
- the Adzuna API
- the YouTube Data API v3: search and channels, and the quota cost per call
- the Apple iTunes Search API and the App Store customer reviews RSS feed
- Jobberman and MyJobMag terms and `robots.txt`

---

## What you own

- `src/modules/acquisition/sourcing/**`
- `runtime-skills/acquisition/source-*/**`
- `evals/acquisition/source-*/**`
- `phases/08/**`

---

## Step 1: The runner (`src/modules/acquisition/sourcing/runner.ts`)

**`runSearch(spec, { actor, jobRunId? })`**, where `spec` is a Zod-validated `SearchSpec`:

- `serviceLine`
- `markets: ("NIGERIA" | "INTERNATIONAL")[]`
- `location` (city, region or country, free text plus optional structured parts)
- `keywords[]`
- `sources?` (adapter IDs; defaults to the active profile's sources for those markets)
- `limit` (a total result cap)
- `savedSearchId?`

The flow:

1. **Setup.**
   - Create a `SearchRun` (status `RUNNING`, the spec, the actor, the job-run link).
   - Resolve the profile through `SEAM-PROFILE`.
   - Resolve each adapter's parameters: profile defaults per market, merged with the spec.
2. **Run the adapters,** concurrently with a small concurrency limit. Iterate each adapter's `AsyncIterable<RawSignal>` until the limit, the adapter's own cap, or the run's **budget cap** is reached. The budget cap is set per run in settings: a maximum number of provider calls and a maximum estimated cost.
3. **For each `RawSignal`:**
   1. **Normalise:** domain, phone, name, country.
   2. **Market and country:** decide `country` from the explicit field, then the phone country code, then address parsing, then the ccTLD. `NG` means `NIGERIA`; anything else means `INTERNATIONAL`. If the result falls outside the requested markets, drop it and count it.
   3. **Early suppression check:** if `isSuppressed` matches the domain, phone or email, skip it. Never create a lead, and count it as `suppressed`.
   4. **Match or create the company** through `@/platform/directory`, inside a transaction. Record the source, `collectedAt` and lawful basis `LEGITIMATE_INTEREST_B2B`.
   5. **Store the `Signal`** (company, service line, signal type, evidence text, `sourceUrl`, `observedAt`, adapter ID, raw payload). Keep the raw payload within the provider's storage terms; see Step 3.
   6. **Create or attach the lead.** If there's no open lead for the same company, service line and market, create one in `NEW` through the core helpers, so a `LeadEvent` is written. If a lead exists, attach the new signal to it. If the company has a `DISQUALIFIED` or `SUPPRESSED` lead for this line, or is an active client, don't reopen it; count it.
   7. **Cross-line awareness:** if the company already has an open lead on a **different** line, attach a `crossLineHint` to the signal. Phase 11 builds cross-sell groups from it.
4. **Finish.**
   - Update `SearchRun` with the status, counts (`fetched`, `outOfMarket`, `suppressed`, `companiesCreated`, `companiesMatched`, `leadsCreated`, `leadsUpdated`, `errors`), cost estimate and duration.
   - Emit `sourcing.run.completed`.
   - Notify the actor (or the saved search owner) through `notify` with a link, for runs started from the UI or by a schedule.
5. **Resilience.** One adapter failing doesn't fail the run: record its error, keep going, and finish as `PARTIAL`.

Wrap it as the job **`acquisition.sourcing.run`**. Its idempotency key is `savedSearchId + slot` for scheduled runs, or a UUID for manual runs. Steps: one per adapter, then finalise, so a failure resumes per adapter.

---

## Step 2: Rate limits, retries, quotas and cost

- Each adapter declares `rateLimit` (requests per second and per day) and `costPerCall` (an estimate in USD minor units, taken from the verified pricing).
- A shared **limiter:**
  - in-process token bucket per adapter
  - daily counters persisted through the settings store or a small counter table (raise a schema request if needed)
  - so parallel runs don't exceed provider quotas
- **Retries** with exponential backoff and jitter, for 429 and 5xx only. Respect `Retry-After`. Never retry 4xx validation errors.
- **Per-run budget cap and per-day platform cap** for each paid provider, from settings. When reached, stop that adapter gracefully and record why.
- `estimateSearchCost(spec)` gives the UI a before-you-run estimate.

---

## Step 3: Adapters (`src/modules/acquisition/sourcing/adapters/<id>/`)

Every adapter:

- implements the `SourceAdapter` contract exactly
- has `index.ts` (real), `mock.ts` (realistic fixtures for both markets) and a README (docs links, terms notes, fields used, cost, limits)
- reads its key through `resolveProviderKey`
- uses `MOCKS` or settings to choose real or mock
- declares `termsNotes`
- where it fetches arbitrary web pages, uses `SEAM-SAFE-FETCH`

**Required adapters:**

1. **`google-places`** (both markets):
   - Text Search with a **minimal field mask**: only the fields you need, priced tier by tier.
   - Signals:
     - `no_website`, when there's no website field or it's a social or marketplace URL
     - a listing with a low review count, as a weak signal for new businesses
     - the category
   - The `sourceUrl` is the Maps URL of the place.
   - **Follow the Maps Platform storage terms:** store `place_id` indefinitely, and only store other Places content as the terms allow. Implement a refresh-by-`place_id` helper if caching is limited, and document the choice.
2. **`jobs-serpapi`** (both markets): the Google Jobs engine.
   - Queries come from the profile's job titles per line, for example "graphic designer" or "video editor".
   - Location: Nigeria and its cities, or international target countries.
   - Signal `job_post_<role>` with the title, snippet and posting date as evidence.
   - The company comes from the employer name and the employer website if present.
   - Skip postings from recruitment agencies. Detect them with a heuristic plus an AI check (Step 4).
3. **`jobs-adzuna`** (international): the same signal model, with the countries Adzuna supports.
4. **`jobberman`** and **`myjobmag`** (Nigeria): build them **only if** their terms and `robots.txt` allow automated access to listings. Otherwise, register them as **disabled** adapters with a `disabledReason`, and rely on `jobs-serpapi` with Nigerian locations, which indexes many of those listings. Record the decision and the evidence.
5. **`youtube-channels`** (both markets, for the Video Editing line):
   - YouTube Data API search for channels by niche keywords and `regionCode`.
   - Then `channels.list` for statistics.
   - Signals: `active_creator` (recent uploads), subscriber band, and `gone_quiet` candidates.
   - Stay inside the daily quota: search is expensive, so cache per query per day.
   - Add this adapter ID to the contract through a request.
6. **`apple-app-store`** (both markets, for the UI/UX line):
   - The iTunes Search API finds apps in the target categories and countries.
   - The customer reviews RSS pulls recent reviews.
   - Signals: `low_rating` and `usability_complaints_candidate`. Phase 10 does the deep analysis.
   - The developer website becomes the company website.
   - Add this adapter ID through a request.
7. **`csv-import`** (both markets):
   - Upload through `@/platform/storage` (`createUploadUrl`, purpose `csv-import`).
   - A column-mapping step, then a preview with row-level validation (required: company name, plus a website, phone or email; optional: contact name, role, email, city, country, notes, service line).
   - Market is derived per row.
   - **An attestation is required:** the uploader confirms the data wasn't bought and was collected lawfully (the ban on purchased lists). Store the attestation with the `SearchRun`.
   - Maximum rows per import, from settings.
   - An error report can be downloaded as CSV.
8. **`manual`** (both markets): add one company or lead from a form. Same pipeline, with `sourceUrl` optional and the source recorded as `manual:<userId>`.

The mock fixtures must feel real and cover edge cases:

- Lagos restaurants with no website
- a Warri clinic with an Instagram-only presence
- UK agencies, some of them sole traders
- a US SaaS app with poor reviews
- a Nigerian YouTube creator
- duplicate businesses across sources
- out-of-market results

---

## Step 4: AI helpers for sourcing (`runtime-skills/acquisition/source-*`)

Register these tasks through `tasks.ts`, following the Phase 5 README. Declare references with `selectAcquisitionReferences`, marked optional per the Wave 2 guide, Part B1.

- **`acquisition.source-classify-job-post`:**
  - input: a posting's title, company, snippet and location
  - output: `{ relevantLine: ServiceLine | null, isRecruitmentAgency: boolean, isInHouseFullTeam: boolean, confidence, reason }`
  - It decides whether a job post is a real signal for this line, and weeds out agencies and large teams.
  - It uses the fast model tier.
- **`acquisition.source-extract-company`:**
  - input: a messy source record
  - output: a clean company name, website if stated, and city/country
  - Used when a source gives an unstructured employer name.

Each task needs a mock fixture and at least 8 eval cases, including traps: a recruitment agency, a staffing firm, "urgently hiring 20 developers" (an in-house team, so disqualify), and an injection attempt inside a job description.

---

## Step 5: Saved searches and schedules

Services for Phase 15:

- `createSavedSearch(actor, { name, spec, schedule: cron, timezone, enabled, ownerId })`
- `updateSavedSearch`, `pauseSavedSearch`, `deleteSavedSearch`
- `listSavedSearches({ serviceLine })`
- `runSavedSearchNow`

**Dynamic schedules** (`schedules.ts`): export `getSourcingDynamicSchedules()` for Phase 6's dispatcher. It returns every enabled saved search as a schedule that enqueues `acquisition.sourcing.run`. **Before enqueueing, check capacity:** if `isLineAtCapacity(serviceLine)` is true, skip the run, record a skipped run with the reason `capacity`, and notify the line owners once per day (`capacity.line-full`).

**Search history services:**

- `listSearchRuns({ serviceLine, from, to, cursor })`
- `getSearchRun(id)`, with the leads created
- `cancelSearchRun(id)`
- `getSourceStats({ serviceLine, from, to })`: found, created and duplicates per source, for Phase 17's analytics

Every mutation checks permission (`assertCan`) with the service line as the resource, and is audited.

Export `sourcingJobs`, `sourcingSettings` (budget caps, limits, maximum CSV rows, default concurrency) and `getSourcingDynamicSchedules`, and list them in `REQUESTS.md`.

---

## Step 6: Tests

- **Unit tests:**
  - market and country derivation (NG phone formats, `.ng` / `.com.ng` domains, UK and US addresses, ambiguous cases)
  - out-of-market filtering
  - the limiter and budget cap
  - retry policy
  - CSV mapping and validation, including a missing attestation
  - each adapter's mapping from provider response to `RawSignal`, using recorded fixtures with MSW; there's no real network
- **Integration tests** (test database, mock adapters, inline job runner):
  - `runSearch` for each line in each market creates companies, signals and `NEW` leads with `LeadEvent`s
  - running it again creates **no duplicates**, and only attaches new signals
  - suppressed companies never become leads
  - a disqualified lead isn't reopened
  - a cross-line hint is recorded
  - a failing adapter gives a `PARTIAL` run with the error recorded
  - a saved search is skipped when the line is at capacity
  - permissions: a `SERVICE_LEAD` for Video Editing can't run a Web Development search
- **Evals** for both AI tasks, in mock mode (and live if a key is present).
- **Optional live check:** if real keys exist in the vault, run each real adapter with `limit: 3` and record the response shape and cost in your summary.

---

## Constraints

- **Respect every provider's terms and `robots.txt`.** Never scrape behind a login. No LinkedIn. No purchased data.
- **Don't edit the manifest, schema or contracts.** Use requests.
- **No UI.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The runner works end to end, with normalisation, market tagging, early suppression, directory dedupe, signals with evidence, lead creation with events, cross-line hints, counts, cost, events and notifications.
- [ ] The limiter, retries, and budget caps (per run and per day) work, and `estimateSearchCost` exists.
- [ ] Every required adapter exists with a real implementation, a mock and a README with verified docs and terms links. Jobberman and MyJobMag are built or disabled with the evidence recorded.
- [ ] The CSV import has mapping, preview, validation, attestation and an error report. Manual add works.
- [ ] Both AI tasks have skills, fixtures and evals.
- [ ] Saved searches work, dynamic schedules are exported, and capacity skipping works.
- [ ] The search history and source stats services exist.
- [ ] `phases/08/REQUESTS.md` lists the jobs, settings, schedules, contract additions (new adapter IDs) and any schema requests (counters).
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/08/SUMMARY.md` is written.
