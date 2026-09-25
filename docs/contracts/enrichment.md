# Contract: Enrichment, safe fetching and contactability

| | |
|---|---|
| Module | `src/contracts/enrichment.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 9: `@/platform/http` (`safeFetch`, `isAllowedByRobots`); `src/modules/acquisition/enrichment/` (crawler, extractors, finder, verifier, pipeline); `src/modules/acquisition/compliance/` (legal form, country rules, contactability, suppression, consent, DSR, retention) |
| Consumers | 8 and 10 (SEAM-SAFE-FETCH), 11 (contactability in scoring), 12 (`assertEmailAllowed` in the send path), 13 (verifier for referrals), 16 and 18 (lead detail, compliance screens) |
| Related rules | INV-2, 3, 6, 7, 10, 12, 14, 25; ADR-020 (email finder provider), ADR-034 (country-rule defaults pending legal review) |

## 1. Purpose

Enrichment turns a company name into a reachable, compliant lead: the website crawl, extracted contacts, socials and hints, found and verified emails, the best contact for the line, the legal form, and a **contactability verdict** that every send path obeys.

## 2. Types and schemas

```ts
// src/contracts/enrichment.ts
import { z } from "zod";
import {
  Iso8601Schema, HttpUrlSchema, CountryCodeSchema, EmailStatusSchema, EmailTypeSchema, WhatsAppStatusSchema,
  LegalFormSchema, ServiceLineSchema, MarketSchema, ContactSenioritySchema, CrawlStatusSchema, LawfulBasisSchema,
  type Actor, type LegalForm, type ProviderId,
} from "./common";

// ---------- SEAM-SAFE-FETCH types (copied exactly from docs/prompts/wave-2/wave-2-prep-and-merge.md Part B2) ----------
export type SafeFetchOptions = {
  method?: "GET" | "HEAD"; headers?: Record<string, string>;
  timeoutMs?: number;            // default 10000
  maxBytes?: number;             // default 2_000_000
  respectRobots?: boolean;       // default true
  followRedirects?: number;      // default 5
  cacheTtlSeconds?: number;      // default 0 (no cache)
};
export type SafeFetchResult = {
  ok: boolean; status: number; finalUrl: string; headers: Record<string, string>;
  contentType: string | null; body: string | null; bytes: number; fetchedAt: string;
  blockedReason?: "robots" | "ssrf" | "too-large" | "timeout" | "non-html" | "error";
};
/** @/platform/http (Phase 9). User agent: "FUTUREUNI-Bot/1.0 (+<platform.crawlerContactUrl>)". */
export type SafeFetch = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;
export type IsAllowedByRobots = (url: string, userAgent?: string) => Promise<boolean>;

// ---------- Typed JSON stored on Company / Contact ----------
export const CompanySocialsSchema = z.object({
  instagram: HttpUrlSchema.optional(), facebook: HttpUrlSchema.optional(),
  linkedin: HttpUrlSchema.optional(),      // company page URL only; never scraped
  x: HttpUrlSchema.optional(), tiktok: HttpUrlSchema.optional(), youtube: HttpUrlSchema.optional(),
  behance: HttpUrlSchema.optional(), dribbble: HttpUrlSchema.optional(),
  whatsapp: HttpUrlSchema.optional(),      // a wa.me or api.whatsapp.com link found on the site
});
export type CompanySocials = z.infer<typeof CompanySocialsSchema>;

/** Per-field provenance (INV-10): which source set each field, when, and whether it's verified. */
export const FieldSourcesSchema = z.record(
  z.string(),                              // field name, e.g. "website", "phones", "legalForm", "email"
  z.object({ source: z.string().max(80), collectedAt: Iso8601Schema, verified: z.boolean().default(false), sourceUrl: HttpUrlSchema.optional() }),
);
export type FieldSources = z.infer<typeof FieldSourcesSchema>;

export const TechHintsSchema = z.object({
  generator: z.string().max(120).optional(),                       // <meta name="generator">
  platforms: z.array(z.enum(["wordpress", "wix", "squarespace", "shopify", "webflow", "godaddy", "joomla", "drupal", "custom", "other"])).default([]),
  jqueryVersion: z.string().max(20).optional(),
  legacyTech: z.array(z.string().max(40)).default([]),              // "flash", "table-layout", "http-only-forms", "frames"
  copyrightYear: z.int().min(1990).max(2100).optional(),
  httpsAvailable: z.boolean().optional(),
});
export type TechHints = z.infer<typeof TechHintsSchema>;

export const VerifierFlagsSchema = z.object({
  catchAll: z.boolean(), disposable: z.boolean(), roleBased: z.boolean(), webmail: z.boolean(),
  mxFound: z.boolean().optional(), smtpCheck: z.boolean().optional(),
  providerStatus: z.string().max(40).optional(),                    // raw provider status, e.g. "accept_all"
});
export type VerifierFlags = z.infer<typeof VerifierFlagsSchema>;

// ---------- Extraction outputs (pure extractors) ----------
export const ExtractedEmailSchema = z.object({
  email: z.email(), kind: EmailTypeSchema,                           // PERSONAL (a person's name) | ROLE (info@, hello@, sales@)
  source: z.enum(["mailto", "text", "obfuscated", "schema-org", "finder"]),
  pageUrl: HttpUrlSchema.optional(), personName: z.string().max(120).optional(),
});
export const ExtractedPhoneSchema = z.object({
  e164: z.e164(), source: z.enum(["tel", "text", "schema-org", "places"]), pageUrl: HttpUrlSchema.optional(),
  whatsapp: WhatsAppStatusSchema,                                    // CONFIRMED only from wa.me / api.whatsapp.com links
});
export const LegalFormHintSchema = z.object({
  kind: z.enum(["suffix", "uk-company-number", "ng-rc", "ng-bn", "sole-trader-wording"]),
  value: z.string().max(40), pageUrl: HttpUrlSchema.optional(),
});
export const ContactCandidateSchema = z.object({
  name: z.string().max(120).optional(), role: z.string().max(120).optional(),
  seniority: ContactSenioritySchema.default("UNKNOWN"),           // Prisma enum ContactSeniority; the AI task's lower-case output ("owner"…) is upper-cased on parse
  email: z.email().optional(), emailType: EmailTypeSchema.optional(), phone: z.e164().optional(),
  source: z.string().max(80), sourceUrl: HttpUrlSchema.optional(), evidenceQuote: z.string().max(300).optional(),
});

// ---------- Enricher steps ----------
export type EnrichmentContext = {
  leadId: string; companyId: string; serviceLine: z.infer<typeof ServiceLineSchema>; market: z.infer<typeof MarketSchema>;
  actor: Actor; safeFetch: SafeFetch; now(): Date; signal: AbortSignal;
  budget: { tryCharge(provider: ProviderId, calls: number, costMicros: number): boolean };   // provider IDs: common.md rule 9
};
export const EnrichmentResultSchema = z.object({
  enricherId: z.enum(["website-crawler", "email-finder", "email-verifier", "companies-house", "contact-picker"]),
  crawlStatus: CrawlStatusSchema.optional(),
  pagesFetched: z.int().nonnegative().default(0),
  emails: z.array(ExtractedEmailSchema).default([]),
  phones: z.array(ExtractedPhoneSchema).default([]),
  socials: CompanySocialsSchema.optional(),
  address: z.object({ line: z.string().optional(), city: z.string().optional(), postcode: z.string().optional(), country: CountryCodeSchema.optional() }).optional(),
  techHints: TechHintsSchema.optional(),
  legalFormHints: z.array(LegalFormHintSchema).default([]),
  contacts: z.array(ContactCandidateSchema).default([]),
  notes: z.array(z.string().max(200)).default([]),
  costMicros: z.int().nonnegative().default(0),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;
export interface Enricher {
  id: EnrichmentResult["enricherId"];
  run(company: { id: string; name: string; website: string | null; normalizedDomain: string | null; country: string | null }, ctx: EnrichmentContext): Promise<EnrichmentResult>;
}

// ---------- Email finder and verifier (ADR-020: "hunter", plus "mock"; another provider needs a new ADR and a contract change) ----------
export const FoundEmailSchema = z.object({
  email: z.email(), firstName: z.string().optional(), lastName: z.string().optional(), position: z.string().optional(),
  confidence: z.int().min(0).max(100), sources: z.array(HttpUrlSchema).default([]),
});
export interface EmailFinder {
  id: "hunter" | "mock";                      // Hunter per ADR-020; another provider needs an ADR
  domainSearch(domain: string, opts?: { limit?: number }): Promise<Array<z.infer<typeof FoundEmailSchema>>>;
  findEmail(input: { domain: string; firstName: string; lastName: string }): Promise<z.infer<typeof FoundEmailSchema> | null>;
}
export const EmailVerificationSchema = z.object({
  email: z.email(),
  status: EmailStatusSchema.exclude(["UNVERIFIED"]),                  // VALID | RISKY | INVALID | UNKNOWN
  flags: VerifierFlagsSchema, provider: z.string(), checkedAt: Iso8601Schema,
});
export interface EmailVerifier {
  id: "hunter" | "mock";
  /** Hunter HTTP 451 `claimed_email` surfaces as { status: "INVALID", flags.providerStatus: "claimed_email" } plus an OBJECTION suppression (rule 13a). */
  verify(email: string): Promise<z.infer<typeof EmailVerificationSchema>>;
}

// ---------- Legal form (UK Companies House; Nigeria CAC hints) ----------
export const LegalFormDetectionSchema = z.object({
  legalForm: LegalFormSchema,
  source: z.enum(["companies-house", "crawl-hint", "cac-hint", "places", "manual"]),
  confidence: z.number().min(0).max(1),
  companyNumber: z.string().max(20).optional(),
  matchedName: z.string().max(200).optional(),
  evidence: z.string().max(300),
});
export type LegalFormDetection = z.infer<typeof LegalFormDetectionSchema>;
/**
 * Companies House company_type → LegalForm (starting set; Phase 9 verifies it against the Companies House enumeration
 * and completes it). Anything unmapped → OTHER. Not found → UNKNOWN. OTHER and UNKNOWN fall in the `unknownForm`
 * bucket below (see project-rules INV-6 for how the UK rule treats them).
 */
export const COMPANIES_HOUSE_TYPE_MAP = {
  "ltd": "LIMITED", "private-limited-guarant-nsc": "LIMITED", "private-limited-guarant-nsc-limited-exemption": "LIMITED",
  "plc": "PLC", "llp": "LLP", "limited-partnership": "PARTNERSHIP",
  "charitable-incorporated-organisation": "NON_PROFIT", "private-unlimited": "OTHER",
} as const;

// ---------- Country rules (data lives in compliance/country-rules.ts, Phase 9; "requires legal review") ----------
/** PROHIBITED maps to the contactability email verdict BLOCKED (ruleId "<CC>.prohibited"). */
export const ColdEmailRuleSchema = z.enum(["ALLOWED", "CONSENT_REQUIRED", "REVIEW", "PROHIBITED"]);
/** Which CountryRule.coldEmail bucket each LegalForm uses. Exhaustive over LegalForm. */
export const LEGAL_FORM_BUCKET = {
  LIMITED: "incorporated", PLC: "incorporated", LLP: "incorporated", NG_REGISTERED_COMPANY: "incorporated",
  CORPORATION: "incorporated", LLC: "incorporated", NON_PROFIT: "incorporated", PUBLIC_BODY: "incorporated",
  SOLE_TRADER: "soleTrader", NG_BUSINESS_NAME: "soleTrader",
  PARTNERSHIP: "partnership",
  UNKNOWN: "unknownForm", OTHER: "unknownForm",
} as const satisfies Record<LegalForm, "incorporated" | "soleTrader" | "partnership" | "unknownForm">;
export const CountryRuleSchema = z.object({
  country: CountryCodeSchema,
  coldEmail: z.object({ incorporated: ColdEmailRuleSchema, soleTrader: ColdEmailRuleSchema, partnership: ColdEmailRuleSchema, unknownForm: ColdEmailRuleSchema }),
  unsubscribeRequired: z.boolean(),
  postalAddressRequired: z.boolean(),
  regime: z.string().max(80),                       // "UK GDPR + PECR", "NDPA 2023", "CAN-SPAM"
  notes: z.string().max(600),
  sourceUrl: HttpUrlSchema,
  reviewedAt: Iso8601Schema.optional(),
});
export type CountryRule = z.infer<typeof CountryRuleSchema>;

// ---------- Contactability (Phase 9 signatures, exact) ----------
export const EmailVerdictSchema = z.enum(["ALLOWED", "CONSENT_REQUIRED", "REVIEW", "BLOCKED"]);
export type EmailVerdict = z.infer<typeof EmailVerdictSchema>;
export const ContactabilitySchema = z.object({
  email:    z.object({ status: EmailVerdictSchema, reason: z.string(), ruleId: z.string().optional() }),
  whatsapp: z.object({ status: z.enum(["ASSISTED_ALLOWED", "BLOCKED"]), reason: z.string() }),   // never automatic (INV-7)
  linkedin: z.object({ status: z.enum(["ASSISTED_ALLOWED", "BLOCKED"]), reason: z.string() }),
  phone:    z.object({ status: z.enum(["CALL_TASK_ALLOWED", "BLOCKED"]), reason: z.string() }),
  lawfulBasis: LawfulBasisSchema,
  evaluatedAt: Iso8601Schema,
});
export type Contactability = z.infer<typeof ContactabilitySchema>;
export type GetContactability = (tx: unknown /* Tx | null */, input: { companyId: string; contactId?: string }) => Promise<Contactability>;
/** Throws AppError("CONTACT_BLOCKED") unless email status is ALLOWED. Called in the same code path as every send (Phase 12). */
export type AssertEmailAllowed = (tx: unknown /* Tx | null */, input: { companyId: string; contactId: string }) => Promise<void>;
```

## 3. Rules

### Safe fetching (`@/platform/http`)

1. **SSRF.** Every fetch resolves DNS and rejects private, loopback, link-local and metadata addresses (169.254.169.254), and their IPv6 equivalents. It re-checks after every redirect, allows only `http:` and `https:`, and blocks non-standard ports unless they're on an allowlist.
2. **robots.txt** is fetched and cached per origin for 24 hours, and evaluated for the platform user agent. `respectRobots: false` is allowed only in code that calls an official API, never for crawling.
3. **Limits and politeness.** Each fetch has a timeout and a `maxBytes` enforced while streaming, and redirects are capped. Bodies are returned only for HTML and text content types unless the caller asks otherwise. Each origin gets one request at a time with at least 1 s between requests (configurable), under a global concurrency cap.
4. **Observability.** Counters record fetches, blocks by reason, and bytes. Full bodies are never logged.

### Crawling and extraction

5. **Crawl plan.**
   - Start at the homepage, then follow prioritised internal links: contact, about, team, our-story, services, careers, legal/privacy, footer.
   - Stay on the same registrable domain, up to 10 pages (configurable).
   - Stop early once the key fields are found. Everything goes through `safeFetch`.
6. **No website is a valid outcome.** `crawlStatus = NO_WEBSITE`. Enrichment continues from the Places, social and directory data, and the lead keeps its Web Development signal.
7. **A crawl failure never fails enrichment.** It sets `crawlStatus` to `FAILED` or `PARTIAL`, records the error, and continues.
8. **Emails.** Extraction covers `mailto:` links, visible text, common obfuscations and schema.org. Placeholders and system addresses are filtered out (`example@`, `you@domain`, Wix/Sentry addresses). Each email is classified as `PERSONAL` or `ROLE`.
9. **WhatsApp.**
   - A `wa.me` or `api.whatsapp.com` link gives `CONFIRMED`.
   - A Nigerian mobile number (070, 080, 081, 090 or 091 prefixes, or their `+234` forms) with no link gives `LIKELY`, never `CONFIRMED`.
   - Otherwise `UNKNOWN`, or `NONE` if the business has no phone.
10. **LinkedIn.** Only the company page URL is stored. LinkedIn is never scraped (project-rules §Bans).
11. **Personal emails** are never guessed from name patterns without the verifier confirming them. An email becomes a primary contact only after verification (`VALID`, or `RISKY` with a warning).
12. **Provenance (INV-10).** Every merged field updates `FieldSources` with its source and `collectedAt`. Verified data is never overwritten by unverified data. Contacts record `source`, `collectedAt` and `lawfulBasis`.
13. **Finder economics.** The finder is skipped when the crawl already found a verified personal email for a good role. A verification is reused for 30 days (configurable). Per-day and per-lead caps come from settings, and every call counts toward `ProviderUsage`.
13a. **Provider objection signals.** Hunter's HTTP 451 `claimed_email` means the person asked Hunter to stop processing their data. It adds an `EMAIL` suppression immediately (reason `OBJECTION`, source `PROVIDER_SIGNAL`, note `hunter:claimed_email`) through the normal `addSuppression` path, so INV-2 and INV-3 apply.

### Compliance and contactability

14. **Legal form.**
    - **UK:** a Companies House lookup by company number (from the crawl hints) or by name plus postcode or city, with a confidence score. Its type maps through `COMPANIES_HOUSE_TYPE_MAP`. Sole-trader wording gives `SOLE_TRADER`. Not found gives `UNKNOWN`.
    - **Nigeria:** `RC` means `NG_REGISTERED_COMPANY`, and `BN` means `NG_BUSINESS_NAME`. This is recorded for context and scoring; the Nigerian email verdict comes from the `NG` country rule (rule 15), not from the legal form.
15. **Country rules** are typed data with a `sourceUrl`, marked "requires legal review. Not legal advice." Unknown countries default to `REVIEW`.
    - **Starting defaults (ADR-034):**
      - **`NG`:** every legal form is `REVIEW` while the setting `acquisition.compliance.ngDirectMarketingBasis` is `PENDING_LEGAL_REVIEW` (NDPC GAID 2025 Art. 18(1)(a)). The setting value `LEGITIMATE_INTEREST_CONFIRMED` maps incorporated bodies to `ALLOWED`; `CONSENT_ONLY` maps every form to `CONSENT_REQUIRED`.
      - **`GB`:** incorporated bodies `ALLOWED`; sole traders and partnerships `CONSENT_REQUIRED`; unknown form `REVIEW` (INV-6).
      - **`DE`, `AT`, `IT`, `ES`, `BE`:** `CONSENT_REQUIRED` for every form.
      - **`US`, `CA`, `IE`, `FR`, `NL`:** `ALLOWED` for incorporated bodies, `REVIEW` otherwise.
      - **Every other listed country:** `REVIEW`.
    - `Lead.complianceReview` is defined once, in `.claude/project-rules.md` §"Domain invariants" (complianceReview). Phase 9 owns it. It recomputes the flag on every verdict change and, through `acquisition.compliance.reevaluate` (triggered by `settings.changed`), on every change to `acquisition.compliance.ngDirectMarketingBasis`, emitting `compliance.verdict.changed` per lead whose verdict changed. Phase 11 only reads it.
    - Each legal form maps to a `coldEmail` bucket through `LEGAL_FORM_BUCKET`. A `PROHIBITED` rule gives email `BLOCKED` with ruleId `<CC>.prohibited`.
16. **Contactability rule order** (`getContactability`):
    1. Suppression of the email, phone or domain makes every channel `BLOCKED`.
    2. A consent record overrides `CONSENT_REQUIRED`.
    3. The country rule plus the legal form (through `LEGAL_FORM_BUCKET`) decide the email status. A UK sole trader or partnership without consent gives `CONSENT_REQUIRED` (INV-6). A UK company with an `UNKNOWN` or `OTHER` legal form gives `REVIEW`. `PROHIBITED` gives `BLOCKED`.
    4. An `INVALID` email makes email `BLOCKED`.
    5. WhatsApp and LinkedIn are only ever `ASSISTED_ALLOWED` or `BLOCKED` (INV-7).
    6. Phone is `CALL_TASK_ALLOWED` or `BLOCKED`.
17. **`assertEmailAllowed`** runs in the same code path and transaction as every email send, together with `assertNotSuppressed` (INV-2, INV-6).
18. **A verdict change** (for example a legal form found later) emits `compliance.verdict.changed` and is stored on the lead (`Lead.contactability`, `contactabilityEvaluatedAt`).

## 4. Worked example

```ts
ContactabilitySchema.parse({
  email:    { status: "CONSENT_REQUIRED", reason: "UK sole trader: cold email needs recorded consent (PECR).", ruleId: "GB.soleTrader" },
  whatsapp: { status: "ASSISTED_ALLOWED", reason: "Assisted only; a human sends it." },
  linkedin: { status: "ASSISTED_ALLOWED", reason: "Company page found; assisted only." },
  phone:    { status: "CALL_TASK_ALLOWED", reason: "Business phone on the website." },
  lawfulBasis: "LEGITIMATE_INTEREST_B2B",
  evaluatedAt: "2026-10-03T09:02:11Z",
});
```

## 5. Invalid example (Phase 2 test)

```ts
ContactabilitySchema.safeParse({ ...valid, whatsapp: { status: "AUTOMATIC", reason: "API" } });
// → fails: ["whatsapp","status"] invalid enum value (ASSISTED_ALLOWED | BLOCKED): WhatsApp is never automatic (INV-7)
```
