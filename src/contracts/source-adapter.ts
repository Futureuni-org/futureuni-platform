/**
 * Contract: source adapters and search (docs/contracts/source-adapter.md).
 * Implemented by Phase 8 (the acquisition sourcing runner, adapters and saved searches).
 */

import { z } from "zod";

import { AuditCheckIdSchema } from "./audit-agent";
import {
  CostMicrosSchema,
  CountryCodeSchema,
  HttpUrlSchema,
  IdSchema,
  Iso8601Schema,
  LeadStatusSchema,
  MarketSchema,
  ServiceLineSchema,
  SlugIdSchema,
  type Actor,
  type Clock,
  type ProviderId,
} from "./common";
import { CompanySocialsSchema, type SafeFetchOptions, type SafeFetchResult } from "./enrichment";

export const SourceAdapterIdSchema = z.enum([
  "google-places", // NIGERIA + INTERNATIONAL · Google Places API (New) Text Search
  "jobs-serpapi", // NIGERIA + INTERNATIONAL · SerpAPI Google Jobs engine
  "jobs-adzuna", // INTERNATIONAL · Adzuna API · DISABLED by default: commercial use beyond a 14-day trial needs a licence, and contacting advertisers breaches its terms
  "jobberman", // NIGERIA · DISABLED: terms clause 22 bans robots/scraping without written approval; robots.txt disallows /job/
  "myjobmag", // NIGERIA · public RSS/XML job feeds only (robots-allowed); live use after FUTUREUNI confirms feed use with MyJobMag
  "youtube-channels", // NIGERIA + INTERNATIONAL · YouTube Data API v3 (Video Editing)
  "apple-app-store", // NIGERIA + INTERNATIONAL · iTunes Search API + App Store customer reviews RSS (UI/UX)
  "csv-import", // NIGERIA + INTERNATIONAL · uploaded CSV with lawful-collection attestation
  "manual", // NIGERIA + INTERNATIONAL · one company or lead added by hand
]);
export type SourceAdapterId = z.infer<typeof SourceAdapterIdSchema>;

// ---------- Signal types each adapter emits (rule 14, §3a) ----------
/** Reserved signal every profile knows implicitly (weight 0, never scored). csv-import and manual always record it. */
export const MANUAL_LEAD_SIGNAL = "manual_lead";
/** The signalType values an adapter may emit. csv-import and manual may also emit any signal ID of the line's profile the user selects. */
export const ADAPTER_SIGNAL_TYPES = {
  "google-places": ["no_website", "ecommerce_on_social_only", "new_business"],
  "jobs-serpapi": [
    "job_post_web_developer",
    "job_post_product_designer",
    "job_post_graphic_designer",
    "job_post_video_editor",
  ],
  "jobs-adzuna": [
    "job_post_web_developer",
    "job_post_product_designer",
    "job_post_graphic_designer",
    "job_post_video_editor",
  ],
  jobberman: [
    "job_post_web_developer",
    "job_post_product_designer",
    "job_post_graphic_designer",
    "job_post_video_editor",
  ],
  myjobmag: [
    "job_post_web_developer",
    "job_post_product_designer",
    "job_post_graphic_designer",
    "job_post_video_editor",
  ],
  "youtube-channels": ["active_creator", "gone_quiet"],
  "apple-app-store": ["app_low_rating", "app_reviews_usability_complaints"],
  "csv-import": [MANUAL_LEAD_SIGNAL],
  manual: [MANUAL_LEAD_SIGNAL],
} as const satisfies Record<SourceAdapterId, readonly string[]>;

/** Credentials vault provider each adapter needs (common.md rule 9); null = no key. */
export const ADAPTER_PROVIDER = {
  "google-places": "google-places",
  "jobs-serpapi": "serpapi",
  "jobs-adzuna": "adzuna",
  jobberman: null,
  myjobmag: null,
  "youtube-channels": "youtube-data",
  "apple-app-store": null,
  "csv-import": null,
  manual: null,
} as const satisfies Record<SourceAdapterId, ProviderId | null>;

// ---------- Signal origin (Signal.adapterId, Signal.detectedBy) ----------
/** Signal.adapterId: a source adapter, or a derived signal written later by Phase 9 (enrichment) or Phase 10 (audit). */
export const SignalOriginSchema = z.union([SourceAdapterIdSchema, z.enum(["enrichment", "audit"])]);
export type SignalOrigin = z.infer<typeof SignalOriginSchema>;
/** Signal.detectedBy for derived signals ("enrichment" or "audit:<checkId>"); null for adapter signals. */
export const DerivedSignalDetectorSchema = z.union([
  z.literal("enrichment"),
  z.templateLiteral(["audit:", AuditCheckIdSchema]),
]);
export type DerivedSignalDetector = z.infer<typeof DerivedSignalDetectorSchema>;

// ---------- Search spec (runSearch input, SavedSearch.spec) ----------
export const SearchLocationSchema = z.object({
  market: MarketSchema,
  text: z.string().min(2).max(120), // "Lagos", "Manchester, UK", "United States"
  city: z.string().max(80).optional(),
  region: z.string().max(80).optional(),
  country: CountryCodeSchema.optional(), // NG for NIGERIA; required for INTERNATIONAL unless text names a country
});
export const SearchSpecSchema = z
  .object({
    serviceLine: ServiceLineSchema,
    markets: z.array(MarketSchema).min(1).max(2),
    locations: z.array(SearchLocationSchema).min(1).max(4), // at least one per selected market
    keywords: z.array(z.string().min(2).max(60)).max(20),
    sources: z.array(SourceAdapterIdSchema).optional(), // default: the active profile's sources for those markets
    limit: z.int().min(1).max(500), // total result cap across adapters
    savedSearchId: IdSchema.optional(),
  })
  .superRefine((s, ctx) => {
    for (const m of s.markets)
      if (!s.locations.some((l) => l.market === m))
        ctx.addIssue({ code: "custom", path: ["locations"], message: `Add a location for ${m}` });
    for (const [i, l] of s.locations.entries())
      if (!s.markets.includes(l.market))
        ctx.addIssue({
          code: "custom",
          path: ["locations", i, "market"],
          message: "Location market isn't selected",
        });
  });
export type SearchSpec = z.infer<typeof SearchSpecSchema>;

// ---------- Raw signal (adapter output) ----------
export const RawSignalSchema = z
  .object({
    adapterId: SourceAdapterIdSchema,
    companyName: z.string().min(1).max(200),
    website: z.string().max(500).optional(), // as found; may be a social/marketplace URL (normaliser decides)
    phone: z.string().max(40).optional(), // as found; normalised to E.164 by the runner
    email: z.email().optional(), // csv-import and manual only
    address: z
      .object({
        line: z.string().max(200).optional(),
        city: z.string().max(80).optional(),
        region: z.string().max(80).optional(),
        postcode: z.string().max(20).optional(),
        country: CountryCodeSchema.optional(),
      })
      .optional(),
    country: CountryCodeSchema.optional(), // explicit country if the provider gives it
    socials: CompanySocialsSchema.optional(),
    contact: z
      .object({
        // csv-import and manual only
        name: z.string().max(120).optional(),
        role: z.string().max(120).optional(),
        email: z.email().optional(),
        phone: z.string().max(40).optional(),
      })
      .optional(),
    signalType: SlugIdSchema, // a signal id from the line's profile, e.g. "no_website", "job_post_graphic_designer"
    evidenceText: z.string().min(5).max(1000), // human-readable, factual: "Google Maps listing has no website field."
    evidence: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .optional(),
    sourceUrl: HttpUrlSchema.optional(), // required for every adapter except "manual" and "csv-import" (rule 3)
    observedAt: Iso8601Schema,
    externalRef: z
      .object({ adapterId: SourceAdapterIdSchema, externalId: z.string().min(1).max(200) })
      .optional(), // place_id, channel id, app id, job id
    rawPayload: z.record(z.string(), z.unknown()).optional(), // only what the provider's terms allow storing (rule 6)
  })
  .refine(
    (r) => r.adapterId === "manual" || r.adapterId === "csv-import" || r.sourceUrl !== undefined,
    {
      error: "sourceUrl is required except for manual and csv-import entries",
      path: ["sourceUrl"],
    },
  );
export type RawSignal = z.infer<typeof RawSignalSchema>;

// ---------- Adapter interface ----------
export interface SourceContext {
  searchRunId: string;
  serviceLine: z.infer<typeof ServiceLineSchema>;
  market: z.infer<typeof MarketSchema>; // adapters are invoked once per selected market they support
  location: z.infer<typeof SearchLocationSchema>;
  keywords: string[];
  limit: number; // this adapter's share of the run limit
  actor: Actor;
  clock: Clock;
  signal: AbortSignal;
  budget: {
    // per-run and per-day caps (Phase 8, settings)
    tryCharge(calls: number, costMicros: number): boolean; // false → stop gracefully and report CAPPED
    remaining(): { calls: number; costMicros: number };
  };
  resolveKey(provider: ProviderId): Promise<string | null>; // @/platform/credentials resolveProviderKey; pass ADAPTER_PROVIDER[id]
  safeFetch: (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>; // SEAM-SAFE-FETCH / @/platform/http
  log: {
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
  };
}

export interface SourceAdapter<TParams = Record<string, unknown>> {
  id: SourceAdapterId;
  label: string; // "Google Places"
  description: string; // one line, shown in the search panel
  markets: z.infer<typeof MarketSchema>[];
  supportedServiceLines: z.infer<typeof ServiceLineSchema>[];
  paramsSchema: z.ZodType<TParams>; // validates profile defaultParams merged with the spec
  search(params: TParams, ctx: SourceContext): AsyncIterable<RawSignal>;
  rateLimit: { perSecond: number; perDay: number | null };
  costPerCallMicros: number; // estimate from verified pricing (docs/integrations.md)
  termsNotes: string; // what we may store, cache and how long; robots stance
  docsUrl: string;
  termsUrl: string;
  requiresCredential: ProviderId | null; // equals ADAPTER_PROVIDER[id] (jobs-serpapi → "serpapi"); null for csv-import, manual, apple-app-store, myjobmag, jobberman
  status: "ENABLED" | "DISABLED";
  disabledReason?: string; // required when DISABLED, shown in the search panel
}

// ---------- Run bookkeeping (SearchRun JSON columns) ----------
export const SearchRunCountsSchema = z.object({
  fetched: z.int().nonnegative(),
  outOfMarket: z.int().nonnegative(),
  suppressed: z.int().nonnegative(),
  companiesCreated: z.int().nonnegative(),
  companiesMatched: z.int().nonnegative(),
  leadsCreated: z.int().nonnegative(),
  leadsUpdated: z.int().nonnegative(),
  notReopened: z.int().nonnegative(), // company has a DISQUALIFIED/SUPPRESSED lead for this line, or is an active client
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
