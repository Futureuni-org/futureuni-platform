# Phase 9: Enrichment, Contact Discovery and Compliance

> **How to run this phase**
> 1. Wave 1 must be merged and integrated, and Part A of `wave-2-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 09 enrichment`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-09-enrichment.md and execute it. Plan first."**
>
> Wave 2. Runs in parallel with Phases 7, 8 and 10. Depends on Waves 0–1.

---

## Your role and the goal of this phase

You turn a company name into **a reachable, compliant lead**, and you own the **rules that decide who may be contacted, and how**.

**Three parts:**

1. **The safe web fetcher** (`src/platform/http/`). Every part of the platform that fetches a web page goes through it. It handles SSRF protection, `robots.txt`, size and time limits, politeness and caching. Phases 8 and 10 use it through `SEAM-SAFE-FETCH`.
2. **Enrichment** (`src/modules/acquisition/enrichment/`):
   - crawl the company's website politely
   - extract emails, phones, social handles, address, tech hints and legal-form hints
   - find more emails through a finder provider, and verify them
   - identify the best contact person for the service line
   - mark whether the phone is likely WhatsApp-capable
3. **Compliance** (`src/modules/acquisition/compliance/`):
   - legal-form detection (UK Companies House)
   - the country rules table
   - suppression management
   - the **contactability verdict** every send path will use
   - data-subject requests (export and delete)
   - the acquisition retention purge

**No UI.** Phases 16 and 18 build the lead detail, suppression list and data-request screens on your services.

---

## Step 0: Read first

1. `CLAUDE.md` and `.claude/project-rules.md`, especially invariants 2, 3, 6, 7, 10, 12 and 14. You implement most of the compliance invariants.
2. `docs/decisions.md`: the retention ADR and the email finder choice
3. `docs/specs/module-acquisition.md`: enrichment, markets and compliance sections
4. `docs/contracts/enrichment.md` and `src/contracts/enrichment.ts`: implement exactly
5. `docs/integrations.md`: Hunter or Apollo, and Companies House
6. `@/platform/directory`, `@/modules/acquisition/core`, `@/platform/jobs`, `@/platform/credentials`, `@/platform/settings`, `@/platform/audit-log`, `@/platform/events`, `@/platform/storage`, `@/platform/ai` and `@/platform/auth`. Read each README.
7. The Wave 2 guide: you **provide** `SEAM-SAFE-FETCH` (the types are fixed there), you **consume** `SEAM-PROFILE`, and you own the lifecycle transitions listed there
8. `phases/*/SUMMARY.md` for every completed phase
9. The global skills `saas-api` (outbound calls, SSRF), `saas-data`, `saas-ai`, `saas-testing` and `saas-review`

Verify the current docs, pricing and terms for Hunter (or Apollo, per the ADR): domain search, email finder and email verifier. Also verify the Companies House public data API (search and company profile) and its rate limits. Record the source URLs in each adapter's README.

---

## What you own

- `src/platform/http/**`
- `src/modules/acquisition/enrichment/**`
- `src/modules/acquisition/compliance/**`
- `runtime-skills/acquisition/enrich-*/**`
- `evals/acquisition/enrich-*/**`
- `phases/09/**`

---

## Step 1: The safe fetcher (`src/platform/http/`)

Implement `safeFetch` and `isAllowedByRobots` with **exactly** the types in the Wave 2 guide, Part B2.

- **SSRF protection:**
  - resolve DNS and reject private, loopback, link-local, metadata (169.254.169.254) and IPv6 equivalents
  - re-check after every redirect
  - allow only `http:` and `https:`
  - block non-standard ports unless on an allowlist
- **Robots:**
  - fetch and cache `robots.txt` per origin (TTL 24h)
  - evaluate it for the platform user agent, `FUTUREUNI-Bot/1.0 (+contact URL from settings)`
  - `respectRobots` defaults to true and can only be turned off in code for official APIs
- **Limits:**
  - a timeout
  - `maxBytes`, enforced by streaming the body
  - a redirect cap
  - bodies only for HTML and text content types, unless asked otherwise
- **Politeness:**
  - a per-origin concurrency of 1
  - a minimum delay between requests to the same origin (default 1s, configurable)
  - a global concurrency cap
- **Cache:** an optional in-memory LRU plus a short-lived storage cache, keyed by URL, for repeated audits.
- **Observability:** counters for fetches, blocks by reason and bytes. No full bodies in logs.
- **README** with usage examples. Phases 8 and 10 rely on it after merge.

---

## Step 2: Website crawler and extractors (`enrichment/crawler/`, `enrichment/extract/`)

- **Crawl plan per company:**
  - the homepage, then prioritised internal links: contact, about, team, our-story, services, careers, legal/privacy, footer links
  - same registrable domain only
  - a maximum of 10 pages (configurable)
  - stop early once the key fields are found
  - everything through `safeFetch`
- **Extractors,** pure functions with thorough tests:
  - **Emails:**
    - `mailto:` links and visible text
    - common obfuscations (`name [at] domain [dot] com`, HTML entities)
    - schema.org `email`
    - Filter out images and placeholders (`example@`, `you@domain`, `wix`/`sentry` system addresses).
    - Classify each as `personal` (a person's name) or `role` (info@, hello@, sales@).
  - **Phones:** `tel:` links, visible text, schema.org. Normalised with the directory normaliser, using the company country as the default.
  - **WhatsApp:**
    - `wa.me` and `api.whatsapp.com` links mean a confirmed WhatsApp number
    - otherwise, a Nigerian mobile number (prefixes 070/080/081/090/091 and their `+234` forms) gives `whatsappLikely: true`, never "confirmed"
  - **Social handles:** Instagram, Facebook, LinkedIn (company page URL only, never scraped), X, TikTok, YouTube, Behance and Dribbble. Also merge the social URLs from the company record.
  - **Address and location:** schema.org `PostalAddress`, footer text, and the Places data already stored.
  - **Tech hints:** the generator meta tag and common signatures (WordPress, Wix, Squarespace, Shopify, Webflow, jQuery version, old frameworks), plus the copyright year. These feed the Web Development audit and scoring.
  - **Legal-form hints:**
    - "Ltd", "Limited", "LLP", "PLC", or a UK company number (8 characters) in the footer
    - for Nigeria, "RC" or "BN" numbers (CAC registered company or business name)
    - "sole trader" wording
  - **People:** names and roles from team and about pages, extracted by the AI task in Step 4.

---

## Step 3: Email finder and verifier (`enrichment/providers/`)

- **`EmailFinder` adapter:** `domainSearch(domain)` and `findEmail({ domain, firstName, lastName })`.
  - Implementations: `hunter` (or `apollo`, per the ADR) and `mock`.
  - Returns emails with a position, a confidence and a source.
- **`EmailVerifier` adapter:** `verify(email)`, returning `VALID | RISKY | INVALID | UNKNOWN`, plus flags (`catchAll`, `disposable`, `roleBased`, `webmail`).
  - Implementations: `hunter` and `mock`.
  - Verify before any email becomes the primary contact.
- **Quotas and cost:**
  - per-day caps and a per-lead cap in settings
  - skip the finder when the crawl already found a verified personal email for a good role
  - count calls and cost for the analytics
- **Caching:** don't re-verify an email verified within the last 30 days (configurable).

---

## Step 4: AI helpers (`runtime-skills/acquisition/enrich-*`)

Register these through `tasks.ts` (Phase 5 README), with references from `selectAcquisitionReferences`, marked optional per the Wave 2 guide.

- **`acquisition.enrich-extract-people`:**
  - input: cleaned text from team and about pages (a data block)
  - output: `[{ name, role, seniority: "owner" | "exec" | "manager" | "staff" | "unknown", evidenceQuote }]`
  - It must extract only what the text says, never guess.
- **`acquisition.enrich-pick-contact`:**
  - input: the candidate contacts (name, role, email status, source), the service line, the market and company size
  - output: `{ primaryContactId, backupContactIds[], reason }`
  - It follows the role priorities per line, for example:
    - **Web Development:** owner or founder > operations or marketing manager
    - **Graphic Design:** founder > marketing or brand
    - **Video Editing:** the creator themselves, or their manager
    - **UI/UX Design:** founder, CPO or CTO > product manager
  - A verified role email may be primary only when there's no person.

Fixtures and at least 8 eval cases each. Include traps: a testimonial quote naming a customer (not staff), an injection in page text, and a page listing only a "careers@" email.

---

## Step 5: The enrichment pipeline

**`enrichLead(leadId, { actor, jobRunId? })`:**

1. Transition `NEW → ENRICHING`.
2. Crawl and extract. If the company has **no website**, skip the crawl and use the Places, social and directory data. This is valid, and it's a strong Web Development signal.
3. Merge the results into `Company` and `Contact` through `@/platform/directory`, keeping the source and `collectedAt` for each field. Never overwrite verified data with unverified data.
4. Run the finder if it's needed, then verify the candidate emails.
5. Pick the primary contact.
6. Run **compliance** (Step 6), storing the legal form and the contactability verdict.
7. Transition `ENRICHING → ENRICHED`, recording a summary in the event metadata (contacts found, emails verified, WhatsApp status, legal form, verdict).

   Exceptions:
   - If compliance says the company or contact is suppressed, transition to `SUPPRESSED` instead.
   - If a hard compliance block applies (for example a country where cold outreach is prohibited by the rules table), transition to `DISQUALIFIED` with the reason `compliance:<rule>`.

**Jobs:**

- `acquisition.enrichment.lead` (per lead, with steps crawl → finder → verify → compliance → finalise)
- `acquisition.enrichment.batch` (picks up `NEW` leads in batches of 25, with concurrency from settings)
- `acquisition.enrichment.refresh` (re-enriches stale leads older than N days that are still active)

**Failure handling:** a crawl failure doesn't fail enrichment. Continue with the other data, and record `crawlStatus` and the error.

Export `enrichmentJobs` and `enrichmentSettings` (page limits, delays, finder and verifier caps, re-verify TTL, staleness), and list them in `REQUESTS.md`.

---

## Step 6: Compliance (`src/modules/acquisition/compliance/`)

1. **Country rules table** (`country-rules.ts`). Typed data, per country code, covering:
   - whether cold B2B email is allowed to incorporated bodies, sole traders and partnerships (`ALLOWED`, `CONSENT_REQUIRED`, `REVIEW`, `PROHIBITED`)
   - whether an unsubscribe is required
   - whether the postal address is required
   - notes, and a `sourceUrl`

   Seed it for at least: `NG`, `GB`, `IE`, `US`, `CA`, `DE`, `FR`, `NL`, `ES`, `IT`, `ZA`, `GH`, `KE` and `AE`. **Default to `REVIEW` for unknown countries.** Mark the whole table "requires legal review. Not legal advice." in the file and in your summary. Be conservative, especially within the EU.
2. **Legal form detection:**
   - **UK:** Companies House search by company number (from the crawl hints) or by name plus postcode/city, with fuzzy matching and a confidence score. Map `company_type` to `LIMITED`, `LLP`, `PLC` and so on. Not found, or name-only, gives `UNKNOWN`. Sole-trader wording gives `SOLE_TRADER`.
   - **Nigeria:** `RC` means a registered company, `BN` means a business name (often a sole proprietor). **Nigeria is governed by the NDPA, not PECR,** so this is recorded for context and scoring, not as a block.
   - **Elsewhere:** from hints, or `UNKNOWN`.
3. **The contactability verdict** (the core function):

   ```ts
   export type Contactability = {
     email:    { status: "ALLOWED" | "CONSENT_REQUIRED" | "REVIEW" | "BLOCKED"; reason: string; ruleId?: string };
     whatsapp: { status: "ASSISTED_ALLOWED" | "BLOCKED"; reason: string };   // never automatic (invariant 7)
     linkedin: { status: "ASSISTED_ALLOWED" | "BLOCKED"; reason: string };
     phone:    { status: "CALL_TASK_ALLOWED" | "BLOCKED"; reason: string };
     lawfulBasis: "LEGITIMATE_INTEREST_B2B" | "CONSENT";
     evaluatedAt: string;
   };
   export async function getContactability(tx: Tx | null, input: { companyId: string; contactId?: string }): Promise<Contactability>;
   export async function assertEmailAllowed(tx: Tx | null, input: { companyId: string; contactId: string }): Promise<void>; // throws AppError("CONTACT_BLOCKED")
   ```

   The rules, applied in order:
   1. Suppression means every channel is `BLOCKED`.
   2. A consent record overrides `CONSENT_REQUIRED`.
   3. The country rules plus the legal form decide the email status. UK sole traders and partnerships without consent give `CONSENT_REQUIRED` (invariant 6), and `UNKNOWN` legal form in the UK gives `REVIEW`.
   4. An invalid email means email is `BLOCKED`.
   5. WhatsApp is only ever `ASSISTED_ALLOWED` (invariant 7).

   Phase 12 calls `assertEmailAllowed` in the same code path as sending.
4. **Suppression management:**
   - `addSuppression(actor, { type, value, reason, source })`, normalised
   - `removeSuppression` (`ADMIN` only, audited, with a reason)
   - `listSuppressions`
   - `importSuppressions(csv)`
   - `isSuppressed` re-exported from core
   - **Adding a suppression immediately:**
     - stops active enrolments for matching contacts and companies (write a stop marker the outreach phase honours: set `Enrollment.status = STOPPED` with a reason, inside the transaction)
     - transitions matching open leads to `SUPPRESSED`
     - emits `compliance.suppressed`
5. **Consent records:** `recordConsent(actor, { contactId | email, scope, method, evidence })` and `revokeConsent`.
6. **Data-subject requests:**
   - `createDataSubjectRequest(actor, { type: "EXPORT" | "DELETE", email | phone, requestedBy, notes })`
   - `fulfilExport(id)`: gathers everything held about the person (contact rows, messages, replies, events, notes), writes a JSON file to storage, and returns a signed URL
   - `fulfilDelete(id)`: anonymises the contact's personal fields across related rows, deletes free-text personal data where possible, and **adds a suppression using a hash of the email or phone,** so the person is never sourced again but their plain data isn't kept. Audited, and the request is marked done.
7. **Retention purge:**
   - implements the acquisition part of `platform.retention-purge`
   - personal data on `DISQUALIFIED` and `LOST` leads older than the retention period (the ADR default of 12 months) is anonymised the same way
   - dry-run mode lists what would be purged
   - counts go to the job-run log
8. **Events:** `compliance.verdict.changed`, `compliance.suppressed`, `compliance.dsr.completed`.

Every mutation calls `assertCan` and `withAudit`.

---

## Step 7: Tests

- **Unit tests:**
  - the SSRF guard (private IPs, DNS rebinding through a redirect, IPv6, odd ports)
  - robots parsing and matching
  - the size and time limits
  - every extractor, with nasty real-world HTML fixtures (obfuscated emails, Wix, WordPress, Nigerian phone formats, footer company numbers)
  - WhatsApp detection
  - the country rules table (unknown countries give `REVIEW`)
  - the contactability rule order
  - hashing for suppression after deletion
- **Integration tests** (test database, mock providers, inline job runner):
  - `enrichLead` for a company with a website, one with no website, and one where the crawl fails
  - a UK sole trader gets `CONSENT_REQUIRED`
  - a UK limited company gets `ALLOWED`
  - `addSuppression` stops enrolments and suppresses leads in one transaction
  - DSR export contains everything, and DSR delete anonymises and re-suppresses
  - the retention purge dry run and real run
  - `NEW → ENRICHING → ENRICHED` events are written
  - permissions on suppression removal
- **Evals** for both AI tasks.
- **An MSW guard** ensures no real network in tests.

---

## Constraints

- **Never scrape behind a login.** Never scrape LinkedIn profiles; store only the company page URL.
- **Don't guess personal emails** from name patterns without the verifier confirming them.
- **Don't edit the manifest, schema or contracts.** Use requests.
- **No UI.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] `@/platform/http` implements `safeFetch` and `isAllowedByRobots` with the exact Wave 2 types, SSRF protection, robots, limits, politeness and caching, plus a README.
- [ ] The crawler and every extractor are tested against real-world fixtures.
- [ ] The finder and verifier adapters (real and mock) work, with caps, caching and cost counting.
- [ ] Both AI tasks have skills, fixtures and evals.
- [ ] The enrichment pipeline works with correct transitions and three jobs, and exports are listed in `REQUESTS.md`.
- [ ] Compliance works:
  - the country rules table (marked for legal review)
  - legal form detection for the UK and Nigeria
  - `getContactability` and `assertEmailAllowed`
  - suppression management that stops enrolments
  - consent records
  - DSR export and delete
  - the retention purge with dry run
- [ ] `phases/09/REQUESTS.md` lists the jobs, settings, provided seam (`SEAM-SAFE-FETCH`), and any schema or contract requests.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings, with extra attention to SSRF and PII handling.
- [ ] `phases/09/SUMMARY.md` is written, including a "Needs legal review" note about the country rules.
