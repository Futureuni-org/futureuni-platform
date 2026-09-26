# Contract: Source adapters and search

| | |
|---|---|
| Module | `src/contracts/source-adapter.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 8 (`src/modules/acquisition/sourcing/`: runner, adapters, saved searches) |
| Consumers | 7 (profile `sources[]` and `signals[].detectingSources` use these IDs), 9 and 10 (derived signals, §3a), 15 (search panel, CSV wizard, run pages), 17 (source stats), 19 |
| Related rules | INV-2 (early suppression check), INV-10 (source, collection time and lawful basis), INV-14 (terms and robots), and the bans on purchased lists and login-walled scraping (project-rules §Bans) |

## 1. Purpose

A source adapter turns one provider (Google Places, a jobs API, YouTube, the App Store, a CSV or a manual form) into a stream of `RawSignal`s: evidence that a business may need a FUTUREUNI service. The runner (Phase 8):
- normalises each signal and derives its market and country
- checks suppression early
- matches or creates the company in the shared directory
- stores the `Signal`
- creates or attaches the lead in `NEW`

## 2. Types and schemas

```ts
// src/contracts/source-adapter.ts
import { z } from "zod";
import {
  ServiceLineSchema, MarketSchema, CountryCodeSchema, IdSchema, Iso8601Schema, HttpUrlSchema, SlugIdSchema,
  CostMicrosSchema, LeadStatusSchema, type Actor, type Clock, type ProviderId,
} from "./common";
import { CompanySocialsSchema, type SafeFetchOptions, type SafeFetchResult } from "./enrichment";
import { AuditCheckIdSchema } from "./audit-agent";

export const SourceAdapterIdSchema = z.enum([
  "google-places",      // NIGERIA + INTERNATIONAL · Google Places API (New) Text Search
  "jobs-serpapi",       // NIGERIA + INTERNATIONAL · SerpAPI Google Jobs engine
  "jobs-adzuna",        // INTERNATIONAL · Adzuna API · DISABLED by default: commercial use beyond a 14-day trial needs a licence, and contacting advertisers breaches its terms
  "jobberman",          // NIGERIA · DISABLED: terms clause 22 bans robots/scraping without written approval; robots.txt disallows /job/
  "myjobmag",           // NIGERIA · public RSS/XML job feeds only (robots-allowed); live use after FUTUREUNI confirms feed use with MyJobMag
  "youtube-channels",   // NIGERIA + INTERNATIONAL · YouTube Data API v3 (Video Editing)
  "apple-app-store",    // NIGERIA + INTERNATIONAL · iTunes Search API + App Store customer reviews RSS (UI/UX)
  "csv-import",         // NIGERIA + INTERNATIONAL · uploaded CSV with lawful-collection attestation
  "manual",             // NIGERIA + INTERNATIONAL · one company or lead added by hand
]);
export type SourceAdapterId = z.infer<typeof SourceAdapterIdSchema>;

// ---------- Signal types each adapter emits (rule 14, §3a) ----------
/** Reserved signal every profile knows implicitly (weight 0, never scored). csv-import and manual always record it. */
export const MANUAL_LEAD_SIGNAL = "manual_lead";
/** The signalType values an adapter may emit. csv-import and manual may also emit any signal ID of the line's profile the user selects. */
export const ADAPTER_SIGNAL_TYPES = {
  "google-places": ["no_website", "ecommerce_on_social_only", "new_business"],
  "jobs-serpapi": ["job_post_web_developer", "job_post_product_designer", "job_post_graphic_designer", "job_post_video_editor"],
  "jobs-adzuna": ["job_post_web_developer", "job_post_product_designer", "job_post_graphic_designer", "job_post_video_editor"],
  "jobberman": ["job_post_web_developer", "job_post_product_designer", "job_post_graphic_designer", "job_post_video_editor"],
  "myjobmag": ["job_post_web_developer", "job_post_product_designer", "job_post_graphic_designer", "job_post_video_editor"],
  "youtube-channels": ["active_creator", "gone_quiet"],
  "apple-app-store": ["app_low_rating", "app_reviews_usability_complaints"],
  "csv-import": [MANUAL_LEAD_SIGNAL],
  "manual": [MANUAL_LEAD_SIGNAL],
} as const satisfies Record<SourceAdapterId, readonly string[]>;

/** Credentials vault provider each adapter needs (common.md rule 9); null = no key. */
export const ADAPTER_PROVIDER = {
  "google-places": "google-places",
  "jobs-serpapi": "serpapi",
  "jobs-adzuna": "adzuna",
  "jobberman": null,
  "myjobmag": null,
  "youtube-channels": "youtube-data",
  "apple-app-store": null,
  "csv-import": null,
  "manual": null,
} as const satisfies Record<SourceAdapterId, ProviderId | null>;

// ---------- Signal origin (Signal.adapterId, Signal.detectedBy) ----------
/** Signal.adapterId: a source adapter, or a derived signal written later by Phase 9 (enrichment) or Phase 10 (audit). */
export const SignalOriginSchema = z.union([SourceAdapterIdSchema, z.enum(["enrichment", "audit"])]);
export type SignalOrigin = z.infer<typeof SignalOriginSchema>;
/** Signal.detectedBy for derived signals ("enrichment" or "audit:<checkId>"); null for adapter signals. */
export const DerivedSignalDetectorSchema = z.union([z.literal("enrichment"), z.templateLiteral(["audit:", AuditCheckIdSchema])]);
export type DerivedSignalDetector = z.infer<typeof DerivedSignalDetectorSchema>;

// ---------- Search spec (runSearch input, SavedSearch.spec) ----------
export const SearchLocationSchema = z.object({
  market: MarketSchema,
  text: z.string().min(2).max(120),                // "Lagos", "Manchester, UK", "United States"
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  country: CountryCodeSchema.optional(),           // NG for NIGERIA; required for INTERNATIONAL unless text names a country
});
export const SearchSpecSchema = z.object({
  serviceLine: ServiceLineSchema,
  markets: z.array(MarketSchema).min(1).max(2),
  locations: z.array(SearchLocationSchema).min(1).max(4),   // at least one per selected market
  keywords: z.array(z.string().min(2).max(60)).max(20),
  sources: z.array(SourceAdapterIdSchema).optional(),        // default: the active profile's sources for those markets
  limit: z.int().min(1).max(500),                            // total result cap across adapters
  savedSearchId: IdSchema.optional(),
}).superRefine((s, ctx) => {
  for (const m of s.markets)
    if (!s.locations.some((l) => l.market === m))
      ctx.addIssue({ code: "custom", path: ["locations"], message: `Add a location for ${m}` });
  for (const [i, l] of s.locations.entries())
    if (!s.markets.includes(l.market))
      ctx.addIssue({ code: "custom", path: ["locations", i, "market"], message: "Location market isn't selected" });
});
export type SearchSpec = z.infer<typeof SearchSpecSchema>;

// ---------- Raw signal (adapter output) ----------
export const RawSignalSchema = z.object({
  adapterId: SourceAdapterIdSchema,
  companyName: z.string().min(1).max(200),
  website: z.string().max(500).optional(),          // as found; may be a social/marketplace URL (normaliser decides)
  phone: z.string().max(40).optional(),             // as found; normalised to E.164 by the runner
  email: z.email().optional(),                      // csv-import and manual only
  address: z.object({
    line: z.string().max(200).optional(), city: z.string().max(80).optional(), region: z.string().max(80).optional(),
    postcode: z.string().max(20).optional(), country: CountryCodeSchema.optional(),
  }).optional(),
  country: CountryCodeSchema.optional(),            // explicit country if the provider gives it
  socials: CompanySocialsSchema.optional(),
  contact: z.object({                               // csv-import and manual only
    name: z.string().max(120).optional(), role: z.string().max(120).optional(),
    email: z.email().optional(), phone: z.string().max(40).optional(),
  }).optional(),
  signalType: SlugIdSchema,                         // a signal id from the line's profile, e.g. "no_website", "job_post_graphic_designer"
  evidenceText: z.string().min(5).max(1000),        // human-readable, factual: "Google Maps listing has no website field."
  evidence: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  sourceUrl: HttpUrlSchema.optional(),              // required for every adapter except "manual" and "csv-import" (rule 3)
  observedAt: Iso8601Schema,
  externalRef: z.object({ adapterId: SourceAdapterIdSchema, externalId: z.string().min(1).max(200) }).optional(),  // place_id, channel id, app id, job id
  rawPayload: z.record(z.string(), z.unknown()).optional(),   // only what the provider's terms allow storing (rule 6)
}).refine((r) => r.adapterId === "manual" || r.adapterId === "csv-import" || r.sourceUrl !== undefined,
  { error: "sourceUrl is required except for manual and csv-import entries", path: ["sourceUrl"] });
export type RawSignal = z.infer<typeof RawSignalSchema>;

// ---------- Adapter interface ----------
export interface SourceContext {
  searchRunId: string;
  serviceLine: z.infer<typeof ServiceLineSchema>;
  market: z.infer<typeof MarketSchema>;             // adapters are invoked once per selected market they support
  location: z.infer<typeof SearchLocationSchema>;
  keywords: string[];
  limit: number;                                    // this adapter's share of the run limit
  actor: Actor;
  clock: Clock;
  signal: AbortSignal;
  budget: {                                         // per-run and per-day caps (Phase 8, settings)
    tryCharge(calls: number, costMicros: number): boolean;   // false → stop gracefully and report CAPPED
    remaining(): { calls: number; costMicros: number };
  };
  resolveKey(provider: ProviderId): Promise<string | null>;   // @/platform/credentials resolveProviderKey; pass ADAPTER_PROVIDER[id]
  safeFetch: (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;   // SEAM-SAFE-FETCH / @/platform/http
  log: { info(msg: string, data?: Record<string, unknown>): void; warn(msg: string, data?: Record<string, unknown>): void };
}

export interface SourceAdapter<TParams = Record<string, unknown>> {
  id: SourceAdapterId;
  label: string;                                    // "Google Places"
  description: string;                              // one line, shown in the search panel
  markets: Array<z.infer<typeof MarketSchema>>;
  supportedServiceLines: Array<z.infer<typeof ServiceLineSchema>>;
  paramsSchema: z.ZodType<TParams>;                 // validates profile defaultParams merged with the spec
  search(params: TParams, ctx: SourceContext): AsyncIterable<RawSignal>;
  rateLimit: { perSecond: number; perDay: number | null };
  costPerCallMicros: number;                        // estimate from verified pricing (docs/integrations.md)
  termsNotes: string;                               // what we may store, cache and how long; robots stance
  docsUrl: string;
  termsUrl: string;
  requiresCredential: ProviderId | null;            // equals ADAPTER_PROVIDER[id] (jobs-serpapi → "serpapi"); null for csv-import, manual, apple-app-store, myjobmag, jobberman
  status: "ENABLED" | "DISABLED";
  disabledReason?: string;                          // required when DISABLED, shown in the search panel
}

// ---------- Run bookkeeping (SearchRun JSON columns) ----------
export const SearchRunCountsSchema = z.object({
  fetched: z.int().nonnegative(), outOfMarket: z.int().nonnegative(), suppressed: z.int().nonnegative(),
  companiesCreated: z.int().nonnegative(), companiesMatched: z.int().nonnegative(),
  leadsCreated: z.int().nonnegative(), leadsUpdated: z.int().nonnegative(),
  notReopened: z.int().nonnegative(),              // company has a DISQUALIFIED/SUPPRESSED lead for this line, or is an active client
  errors: z.int().nonnegative(),
});
export type SearchRunCounts = z.infer<typeof SearchRunCountsSchema>;

export const SearchRunSourceResultSchema = z.object({
  adapterId: SourceAdapterIdSchema,
  market: MarketSchema,
  status: z.enum(["QUEUED", "RUNNING", "DONE", "FAILED", "CAPPED", "SKIPPED"]),
  fetched: z.int().nonnegative(),
  calls: z.int().nonnegative(),
  costMicros: CostMicrosSchema,
  error: z.string().max(500).optional(),
  cappedReason: z.enum(["RUN_BUDGET", "DAILY_CAP", "PROVIDER_QUOTA", "LIMIT_REACHED"]).optional(),
});
export type SearchRunSourceResult = z.infer<typeof SearchRunSourceResultSchema>;

/** Stored on SearchRun for CSV imports: the uploader confirms the data wasn't bought (project-rules §Bans). */
export const CsvAttestationSchema = z.object({
  statement: z.literal("I confirm this data was not purchased and was collected lawfully."),
  attestedById: IdSchema,
  attestedAt: Iso8601Schema,
  fileObjectId: IdSchema,
  rowCount: z.int().min(1),
});
export type CsvAttestation = z.infer<typeof CsvAttestationSchema>;

/** Attached to a Signal when the company already has an open lead on a different line (Phase 11 builds cross-sell groups). */
export const CrossLineHintSchema = z.object({
  otherLeadId: IdSchema,
  otherServiceLine: ServiceLineSchema,
  otherStatus: LeadStatusSchema,
});
export type CrossLineHint = z.infer<typeof CrossLineHintSchema>;
```

## 3. Rules

1. **Adapter IDs** are the enum above. Adding one is a contract change through `REQUESTS.md`. Profiles may reference only these IDs.
2. **Each adapter** has `index.ts` (real), `mock.ts` (realistic fixtures for both markets), and a README. The README records the verified docs, terms, fields used, cost and limits. The real or mock implementation is chosen by `MOCKS` or settings (ADR-005).
3. **Evidence.** Every `RawSignal` carries a factual `evidenceText`, an `observedAt`, and a `sourceUrl`, except `manual` and `csv-import`, where `sourceUrl` is optional: a manual entry's source is recorded as `manual:<userId>`, and a CSV row's source is its import `SearchRun` with the `CsvAttestation` (a row may still supply a `sourceUrl`). `Signal.sourceUrl` is nullable only for those two adapters (a database CHECK), and only signals with a `sourceUrl` can be cited in outreach (INV-5). Examples of `sourceUrl`: the Google Maps URL of the place, the job posting URL, the YouTube channel URL, the App Store app URL.
4. **Dedupe order** (the runner, through `@/platform/directory`):
   A Google Places candidate carries `searchLocation: { city, region }` (from the SearchSpec location, the search that found it). The listing's own address, city and region are passed for matching only and never stored (INV-14); `upsertCompany` keeps only `searchLocation` for a transient source.
   1. the normalised domain (social and marketplace URLs don't count as a domain)
   2. the normalised E.164 phone
   3. the normalised name plus city (trigram similarity above the threshold)

   `externalRef` (for example a Google `place_id`) is stored in `CompanySourceRef` and matched first when present.
5. **Market and country** are derived in this order:
   1. the explicit `country`
   2. the phone country code
   3. address parsing
   4. the ccTLD

   `NG` means `NIGERIA`, and anything else means `INTERNATIONAL`. Results outside the requested markets are dropped and counted as `outOfMarket`.
6. **Provider terms (INV-14).**
   - Store only what the provider's terms allow. **Google Places:** the Maps Platform terms allow storing `place_id` indefinitely and coordinates for 30 days, and forbid copying or saving business names, addresses or reviews. So `google-places` signals set `externalRef` (the `place_id`), carry **no** `rawPayload`, keep `evidence` to facts the adapter derived (for example `websiteKind`, `reviewCountUnder10`) and never Places content such as ratings or review text, and the directory never persists Google-sourced name, address, phone or review text. Display fields are fetched live by `place_id` (docs/specs/module-acquisition.md §3.5.1). `RawSignal.companyName` and similar fields from Places are used transiently for matching within the run only.
   - **YouTube:** public data may be stored for at most 30 days, then refreshed or deleted.
   - **Adzuna and Jobberman** are registered `DISABLED` with their terms-based `disabledReason` (rule 11). **MyJobMag** reads only its published XML feeds.
   - Never scrape behind a login, never automate LinkedIn, never ingest purchased lists.
   - Fetches of arbitrary web pages go through `safeFetch` (robots.txt respected).
7. **Suppression first (INV-2).** Before a company is created or a lead is made, the runner checks `isSuppressed` for the domain, phone and email. A suppressed company never becomes a lead.
8. **No reopening.** If the company has a `DISQUALIFIED` or `SUPPRESSED` lead for the same line, or `isActiveClient` is set, no new lead is created, and the result counts as `notReopened`. At most one open lead exists per company × line × market (partial unique index).
9. **Budget and rate limits.** Adapters call `ctx.budget.tryCharge` before each paid call and stop gracefully when it returns `false`, reporting `CAPPED`. Retries use backoff with jitter, only on 429 and 5xx, and respect `Retry-After`.
10. **Resilience.** One adapter failing doesn't fail the run. Its error is recorded in `perSource`, and the run ends `PARTIAL`.
11. **Disabled adapters** stay registered with `status: "DISABLED"` and a `disabledReason`, so the search panel can explain them. They never run.
12. **CSV import** requires a `CsvAttestation`. It limits rows with a setting, validates each row, derives the market per row, and produces a downloadable error report.
13. **Lawful basis (INV-10).** Every company and contact created from a signal records its source (adapter ID), `collectedAt`, and `lawfulBasis = LEGITIMATE_INTEREST_B2B`.
14. **Signal types.** An adapter emits only the `signalType` values in `ADAPTER_SIGNAL_TYPES` (§3a) that the line's profile declares; `csv-import` and `manual` always record `manual_lead` and may add any signal the profile declares. The runner drops any other value and logs a warning. Phase 8's prompt names `low_rating` and `usability_complaints_candidate` are superseded by `app_low_rating` and `app_reviews_usability_complaints`.
15. **Derived signals.** Signals first found after sourcing (for example `outdated_site`, `slow_mobile`, `no_ssl`) are written by Phase 9 (`adapterId: "enrichment"`, `detectedBy: "enrichment"`) or Phase 10 (`adapterId: "audit"`, `detectedBy: "audit:<checkId>"`), with `sourceUrl` set to the crawled page or the audit report URL. They aren't `RawSignal`s and don't pass through the runner. Their profile signal has `detectedBy: []`. Adapter signals store `detectedBy: null`.

### 3a. Adapter → signal and provider table

| Adapter | Emits `signalType` | Vault provider (`requiresCredential`) |
|---|---|---|
| `google-places` | `no_website` (no website field, or only a social or marketplace URL), `ecommerce_on_social_only` (NIGERIA), `new_business` (few reviews; weak signal) | `google-places` |
| `jobs-serpapi`, `jobs-adzuna`, `myjobmag`, `jobberman` | `job_post_web_developer`, `job_post_product_designer`, `job_post_graphic_designer`, `job_post_video_editor` (by title classifier) | `serpapi`, `adzuna`, none, none |
| `youtube-channels` | `active_creator`, `gone_quiet` | `youtube-data` (shared with `audit.video`) |
| `apple-app-store` | `app_low_rating`, `app_reviews_usability_complaints` | none |
| `csv-import`, `manual` | `manual_lead` (reserved: weight 0, never scored, known to every profile) plus any profile signal ID the user selects | none |
| *derived* (`enrichment`, `audit`) | signals the profile marks `detectingSources: []`, such as `outdated_site` (enrichment) or `slow_mobile`, `no_ssl`, `no_captions` (audit); `Signal.detectedBy` is `enrichment` or `audit:<checkId>` | — |

## 4. Worked example

```ts
RawSignalSchema.parse({
  adapterId: "google-places",
  companyName: "Mama Put Kitchen",
  phone: "0803 123 4567",
  address: { line: "12 Admiralty Way", city: "Lekki", region: "Lagos", country: "NG" },
  country: "NG",
  socials: { instagram: "https://www.instagram.com/mamaputkitchen" },
  signalType: "no_website",
  evidenceText: "Google Maps listing has no website field; the only link is an Instagram profile.",
  evidence: { websiteKind: "SOCIAL_ONLY", reviewCountUnder10: false },   // derived facts only, never Places content (rule 6)
  sourceUrl: "https://maps.google.com/?cid=1234567890123456789",
  observedAt: "2026-10-03T08:15:00Z",
  externalRef: { adapterId: "google-places", externalId: "ChIJ0000000000000000000000" },
});

SearchSpecSchema.parse({
  serviceLine: "WEB_DEVELOPMENT", markets: ["NIGERIA"],
  locations: [{ market: "NIGERIA", text: "Lagos", city: "Lagos", country: "NG" }],
  keywords: ["restaurants"], limit: 50,
});
```

## 5. Invalid example (Phase 2 test)

```ts
RawSignalSchema.safeParse({ adapterId: "jobs-serpapi", companyName: "Acme Ltd", signalType: "job_post_web_developer",
  evidenceText: "Hiring a web developer", observedAt: "2026-10-03T08:15:00Z" });
// → fails: ["sourceUrl"] "sourceUrl is required except for manual and csv-import entries"
SearchSpecSchema.safeParse({ serviceLine: "WEB_DEVELOPMENT", markets: ["NIGERIA", "INTERNATIONAL"],
  locations: [{ market: "NIGERIA", text: "Lagos" }], keywords: [], limit: 50 });
// → fails: ["locations"] "Add a location for INTERNATIONAL"
```
