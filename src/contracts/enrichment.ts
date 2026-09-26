/**
 * Contract: enrichment, safe fetching and contactability (docs/contracts/enrichment.md).
 * Implemented by Phase 9 (@/platform/http; acquisition enrichment and compliance).
 */

import { z } from "zod";

import {
  ContactSenioritySchema,
  CountryCodeSchema,
  CrawlStatusSchema,
  EmailStatusSchema,
  EmailTypeSchema,
  HttpUrlSchema,
  Iso8601Schema,
  LawfulBasisSchema,
  LegalFormSchema,
  type MarketSchema,
  type ServiceLineSchema,
  WhatsAppStatusSchema,
  type Actor,
  type LegalForm,
  type ProviderId,
} from "./common";

// ---------- SEAM-SAFE-FETCH types (copied exactly from docs/prompts/wave-2/wave-2-prep-and-merge.md Part B2) ----------
export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  timeoutMs?: number; // default 10000
  maxBytes?: number; // default 2_000_000
  respectRobots?: boolean; // default true
  followRedirects?: number; // default 5
  cacheTtlSeconds?: number; // default 0 (no cache)
}
export interface SafeFetchResult {
  ok: boolean;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  contentType: string | null;
  body: string | null;
  bytes: number;
  fetchedAt: string;
  blockedReason?: "robots" | "ssrf" | "too-large" | "timeout" | "non-html" | "error";
}
/** @/platform/http (Phase 9). User agent: "FUTUREUNI-Bot/1.0 (+<platform.crawlerContactUrl>)". */
export type SafeFetch = (url: string, opts?: SafeFetchOptions) => Promise<SafeFetchResult>;
export type IsAllowedByRobots = (url: string, userAgent?: string) => Promise<boolean>;

// ---------- Typed JSON stored on Company / Contact ----------
export const CompanySocialsSchema = z.object({
  instagram: HttpUrlSchema.optional(),
  facebook: HttpUrlSchema.optional(),
  linkedin: HttpUrlSchema.optional(), // company page URL only; never scraped
  x: HttpUrlSchema.optional(),
  tiktok: HttpUrlSchema.optional(),
  youtube: HttpUrlSchema.optional(),
  behance: HttpUrlSchema.optional(),
  dribbble: HttpUrlSchema.optional(),
  whatsapp: HttpUrlSchema.optional(), // a wa.me or api.whatsapp.com link found on the site
});
export type CompanySocials = z.infer<typeof CompanySocialsSchema>;

/** Per-field provenance (INV-10): which source set each field, when, and whether it's verified. */
export const FieldSourcesSchema = z.record(
  z.string(), // field name, e.g. "website", "phones", "legalForm", "email"
  z.object({
    source: z.string().max(80),
    collectedAt: Iso8601Schema,
    verified: z.boolean().default(false),
    sourceUrl: HttpUrlSchema.optional(),
  }),
);
export type FieldSources = z.infer<typeof FieldSourcesSchema>;

export const TechHintsSchema = z.object({
  generator: z.string().max(120).optional(), // <meta name="generator">
  platforms: z
    .array(
      z.enum([
        "wordpress",
        "wix",
        "squarespace",
        "shopify",
        "webflow",
        "godaddy",
        "joomla",
        "drupal",
        "custom",
        "other",
      ]),
    )
    .default([]),
  jqueryVersion: z.string().max(20).optional(),
  legacyTech: z.array(z.string().max(40)).default([]), // "flash", "table-layout", "http-only-forms", "frames"
  copyrightYear: z.int().min(1990).max(2100).optional(),
  httpsAvailable: z.boolean().optional(),
});
export type TechHints = z.infer<typeof TechHintsSchema>;

export const VerifierFlagsSchema = z.object({
  catchAll: z.boolean(),
  disposable: z.boolean(),
  roleBased: z.boolean(),
  webmail: z.boolean(),
  mxFound: z.boolean().optional(),
  smtpCheck: z.boolean().optional(),
  providerStatus: z.string().max(40).optional(), // raw provider status, e.g. "accept_all"
});
export type VerifierFlags = z.infer<typeof VerifierFlagsSchema>;

// ---------- Extraction outputs (pure extractors) ----------
export const ExtractedEmailSchema = z.object({
  email: z.email(),
  kind: EmailTypeSchema, // PERSONAL (a person's name) | ROLE (info@, hello@, sales@)
  source: z.enum(["mailto", "text", "obfuscated", "schema-org", "finder"]),
  pageUrl: HttpUrlSchema.optional(),
  personName: z.string().max(120).optional(),
});
export const ExtractedPhoneSchema = z.object({
  e164: z.e164(),
  source: z.enum(["tel", "text", "schema-org", "places"]),
  pageUrl: HttpUrlSchema.optional(),
  whatsapp: WhatsAppStatusSchema, // CONFIRMED only from wa.me / api.whatsapp.com links
});
export const LegalFormHintSchema = z.object({
  kind: z.enum(["suffix", "uk-company-number", "ng-rc", "ng-bn", "sole-trader-wording"]),
  value: z.string().max(40),
  pageUrl: HttpUrlSchema.optional(),
});
export const ContactCandidateSchema = z.object({
  name: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  seniority: ContactSenioritySchema.default("UNKNOWN"), // Prisma enum ContactSeniority; the AI task's lower-case output ("owner"…) is upper-cased on parse
  email: z.email().optional(),
  emailType: EmailTypeSchema.optional(),
  phone: z.e164().optional(),
  source: z.string().max(80),
  sourceUrl: HttpUrlSchema.optional(),
  evidenceQuote: z.string().max(300).optional(),
});

// ---------- Enricher steps ----------
export interface EnrichmentContext {
  leadId: string;
  companyId: string;
  serviceLine: z.infer<typeof ServiceLineSchema>;
  market: z.infer<typeof MarketSchema>;
  actor: Actor;
  safeFetch: SafeFetch;
  now(): Date;
  signal: AbortSignal;
  budget: { tryCharge(provider: ProviderId, calls: number, costMicros: number): boolean }; // provider IDs: common.md rule 9
}
export const EnrichmentResultSchema = z.object({
  enricherId: z.enum([
    "website-crawler",
    "email-finder",
    "email-verifier",
    "companies-house",
    "contact-picker",
  ]),
  crawlStatus: CrawlStatusSchema.optional(),
  pagesFetched: z.int().nonnegative().default(0),
  emails: z.array(ExtractedEmailSchema).default([]),
  phones: z.array(ExtractedPhoneSchema).default([]),
  socials: CompanySocialsSchema.optional(),
  address: z
    .object({
      line: z.string().optional(),
      city: z.string().optional(),
      postcode: z.string().optional(),
      country: CountryCodeSchema.optional(),
    })
    .optional(),
  techHints: TechHintsSchema.optional(),
  legalFormHints: z.array(LegalFormHintSchema).default([]),
  contacts: z.array(ContactCandidateSchema).default([]),
  notes: z.array(z.string().max(200)).default([]),
  costMicros: z.int().nonnegative().default(0),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;
export interface Enricher {
  id: EnrichmentResult["enricherId"];
  run(
    company: {
      id: string;
      name: string;
      website: string | null;
      normalizedDomain: string | null;
      country: string | null;
    },
    ctx: EnrichmentContext,
  ): Promise<EnrichmentResult>;
}

// ---------- Email finder and verifier (ADR-020: "hunter", plus "mock"; another provider needs a new ADR and a contract change) ----------
export const FoundEmailSchema = z.object({
  email: z.email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  position: z.string().optional(),
  confidence: z.int().min(0).max(100),
  sources: z.array(HttpUrlSchema).default([]),
});
export interface EmailFinder {
  id: "hunter" | "mock"; // Hunter per ADR-020; another provider needs an ADR
  domainSearch(
    domain: string,
    opts?: { limit?: number },
  ): Promise<z.infer<typeof FoundEmailSchema>[]>;
  findEmail(input: {
    domain: string;
    firstName: string;
    lastName: string;
  }): Promise<z.infer<typeof FoundEmailSchema> | null>;
}
export const EmailVerificationSchema = z.object({
  email: z.email(),
  status: EmailStatusSchema.exclude(["UNVERIFIED"]), // VALID | RISKY | INVALID | UNKNOWN
  flags: VerifierFlagsSchema,
  provider: z.string(),
  checkedAt: Iso8601Schema,
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
  ltd: "LIMITED",
  "private-limited-guarant-nsc": "LIMITED",
  "private-limited-guarant-nsc-limited-exemption": "LIMITED",
  plc: "PLC",
  llp: "LLP",
  "limited-partnership": "PARTNERSHIP",
  "charitable-incorporated-organisation": "NON_PROFIT",
  "private-unlimited": "OTHER",
} as const satisfies Record<string, LegalForm>;

// ---------- Country rules (data lives in compliance/country-rules.ts, Phase 9; "requires legal review") ----------
/** PROHIBITED maps to the contactability email verdict BLOCKED (ruleId "<CC>.prohibited"). */
export const ColdEmailRuleSchema = z.enum(["ALLOWED", "CONSENT_REQUIRED", "REVIEW", "PROHIBITED"]);
/** Which CountryRule.coldEmail bucket each LegalForm uses. Exhaustive over LegalForm. */
export const LEGAL_FORM_BUCKET = {
  LIMITED: "incorporated",
  PLC: "incorporated",
  LLP: "incorporated",
  NG_REGISTERED_COMPANY: "incorporated",
  CORPORATION: "incorporated",
  LLC: "incorporated",
  NON_PROFIT: "incorporated",
  PUBLIC_BODY: "incorporated",
  SOLE_TRADER: "soleTrader",
  NG_BUSINESS_NAME: "soleTrader",
  PARTNERSHIP: "partnership",
  UNKNOWN: "unknownForm",
  OTHER: "unknownForm",
} as const satisfies Record<
  LegalForm,
  "incorporated" | "soleTrader" | "partnership" | "unknownForm"
>;
export const CountryRuleSchema = z.object({
  country: CountryCodeSchema,
  coldEmail: z.object({
    incorporated: ColdEmailRuleSchema,
    soleTrader: ColdEmailRuleSchema,
    partnership: ColdEmailRuleSchema,
    unknownForm: ColdEmailRuleSchema,
  }),
  unsubscribeRequired: z.boolean(),
  postalAddressRequired: z.boolean(),
  regime: z.string().max(80), // "UK GDPR + PECR", "NDPA 2023", "CAN-SPAM"
  notes: z.string().max(600),
  sourceUrl: HttpUrlSchema,
  reviewedAt: Iso8601Schema.optional(),
});
export type CountryRule = z.infer<typeof CountryRuleSchema>;

// ---------- Contactability (Phase 9 signatures, exact) ----------
export const EmailVerdictSchema = z.enum(["ALLOWED", "CONSENT_REQUIRED", "REVIEW", "BLOCKED"]);
export type EmailVerdict = z.infer<typeof EmailVerdictSchema>;
export const ContactabilitySchema = z.object({
  email: z.object({
    status: EmailVerdictSchema,
    reason: z.string(),
    ruleId: z.string().optional(),
  }),
  whatsapp: z.object({ status: z.enum(["ASSISTED_ALLOWED", "BLOCKED"]), reason: z.string() }), // never automatic (INV-7)
  linkedin: z.object({ status: z.enum(["ASSISTED_ALLOWED", "BLOCKED"]), reason: z.string() }),
  phone: z.object({ status: z.enum(["CALL_TASK_ALLOWED", "BLOCKED"]), reason: z.string() }),
  lawfulBasis: LawfulBasisSchema,
  evaluatedAt: Iso8601Schema,
});
export type Contactability = z.infer<typeof ContactabilitySchema>;
export type GetContactability = (
  tx: unknown /* Tx | null */,
  input: { companyId: string; contactId?: string },
) => Promise<Contactability>;
/** Throws AppError("CONTACT_BLOCKED") unless email status is ALLOWED. Called in the same code path as every send (Phase 12). */
export type AssertEmailAllowed = (
  tx: unknown /* Tx | null */,
  input: { companyId: string; contactId: string },
) => Promise<void>;
