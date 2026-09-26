/**
 * Contract: common primitives (docs/contracts/common.md). Every other contract imports from here.
 *
 * Enums re-export the Prisma enums, so the database schema is the single source of enum values.
 * This is the only contract that imports the generated enums, and only the enums file (no client).
 * The error map and `ActionResult` are defined in src/lib (Phase 1) and re-exported, not redefined.
 */

import { z } from "zod";

import * as E from "@/generated/prisma/enums";
import { APP_ERROR_STATUS, type AppErrorCode } from "@/lib/errors";

export * from "@/generated/prisma/enums";
export { APP_ERROR_STATUS, type AppErrorCode } from "@/lib/errors";
export type { ActionResult } from "@/lib/result";

// ---- Enum schemas: one per database enum (data-model.md §3) ----
// Other contracts import these; none redeclares an enum's values (rule 1).
export const RoleSchema = z.enum(E.Role);
export const UserStatusSchema = z.enum(E.UserStatus);
export const ServiceLineSchema = z.enum(E.ServiceLine);
export const MarketSchema = z.enum(E.Market);
export const CurrencySchema = z.enum(E.Currency);
export const ActorTypeSchema = z.enum(E.ActorType);
export const LawfulBasisSchema = z.enum(E.LawfulBasis);
export const LegalFormSchema = z.enum(E.LegalForm);
export const CompanySizeRangeSchema = z.enum(E.CompanySizeRange);
export const EmailStatusSchema = z.enum(E.EmailStatus);
export const EmailTypeSchema = z.enum(E.EmailType);
export const ContactSenioritySchema = z.enum(E.ContactSeniority);
export const WhatsAppStatusSchema = z.enum(E.WhatsAppStatus);
export const CrawlStatusSchema = z.enum(E.CrawlStatus);
export const WebsiteKindSchema = z.enum(E.WebsiteKind);
export const SettingScopeSchema = z.enum(E.SettingScope);
export const CredentialStatusSchema = z.enum(E.CredentialStatus);
export const NotificationChannelSchema = z.enum(E.NotificationChannel);
export const EmailDeliveryStatusSchema = z.enum(E.EmailDeliveryStatus);
export const JobStatusSchema = z.enum(E.JobStatus);
export const WebhookEventStatusSchema = z.enum(E.WebhookEventStatus);
export const AiOutcomeSchema = z.enum(E.AiOutcome);
export const AiLogContentSchema = z.enum(E.AiLogContent);
export const FilePurposeSchema = z.enum(E.FilePurpose);
export const FileAccessSchema = z.enum(E.FileAccess);
export const LeadStatusSchema = z.enum(E.LeadStatus);
export const LeadEventKindSchema = z.enum(E.LeadEventKind);
export const NurtureReasonSchema = z.enum(E.NurtureReason);
export const ScoreBandSchema = z.enum(E.ScoreBand);
export const ReviewRecommendationSchema = z.enum(E.ReviewRecommendation);
export const ReviewDecisionTypeSchema = z.enum(E.ReviewDecisionType);
export const ProfileVersionStatusSchema = z.enum(E.ProfileVersionStatus);
export const ApprovalModeSchema = z.enum(E.ApprovalMode);
export const SearchRunStatusSchema = z.enum(E.SearchRunStatus);
export const SearchRunTriggerSchema = z.enum(E.SearchRunTrigger);
export const AuditStatusSchema = z.enum(E.AuditStatus);
export const CheckRunStatusSchema = z.enum(E.CheckRunStatus);
export const FindingSeveritySchema = z.enum(E.FindingSeverity);
export const FindingMethodSchema = z.enum(E.FindingMethod);
export const CrossSellStatusSchema = z.enum(E.CrossSellStatus);
export const CapacityModeSchema = z.enum(E.CapacityMode);
export const ChannelSchema = z.enum(E.Channel);
export const MessageKindSchema = z.enum(E.MessageKind);
export const MessageStatusSchema = z.enum(E.MessageStatus);
export const RejectReasonSchema = z.enum(E.RejectReason);
export const EnrollmentStatusSchema = z.enum(E.EnrollmentStatus);
export const EnrollmentStopReasonSchema = z.enum(E.EnrollmentStopReason);
export const EnrollmentPauseReasonSchema = z.enum(E.EnrollmentPauseReason);
export const MailboxStatusSchema = z.enum(E.MailboxStatus);
export const DnsCheckStatusSchema = z.enum(E.DnsCheckStatus);
export const TrackingEventTypeSchema = z.enum(E.TrackingEventType);
export const ReplyChannelSchema = z.enum(E.ReplyChannel);
export const ReplyClassSchema = z.enum(E.ReplyClass);
export const ReplyMatchMethodSchema = z.enum(E.ReplyMatchMethod);
export const ClassificationSourceSchema = z.enum(E.ClassificationSource);
export const SlaStatusSchema = z.enum(E.SlaStatus);
export const SuppressionTypeSchema = z.enum(E.SuppressionType);
export const SuppressionReasonSchema = z.enum(E.SuppressionReason);
export const SuppressionSourceSchema = z.enum(E.SuppressionSource);
export const ConsentScopeSchema = z.enum(E.ConsentScope);
export const ConsentMethodSchema = z.enum(E.ConsentMethod);
export const DsrTypeSchema = z.enum(E.DsrType);
export const DsrStatusSchema = z.enum(E.DsrStatus);
export const MeetingSourceSchema = z.enum(E.MeetingSource);
export const MeetingStatusSchema = z.enum(E.MeetingStatus);
export const ProposalStatusSchema = z.enum(E.ProposalStatus);
export const DiscountTypeSchema = z.enum(E.DiscountType);
export const DealOutcomeSchema = z.enum(E.DealOutcome);
export const LostReasonSchema = z.enum(E.LostReason);
export const HandoffStatusSchema = z.enum(E.HandoffStatus);

// ---- Provider IDs (credentials vault keys and ProviderUsage.provider; docs/integrations.md §3) ----
/** One key per external account. Several adapters can share one provider (jobs-serpapi → serpapi; youtube-channels and audit.video → youtube-data). */
export const ProviderIdSchema = z.union([
  // "browser" = the ProviderUsage counter for captures (no vault entry; Sandbox uses OIDC)
  z.enum([
    "anthropic",
    "google-places",
    "pagespeed",
    "youtube-data",
    "serpapi",
    "adzuna",
    "hunter",
    "companies-house",
    "resend",
    "cal-com",
    "browser",
  ]),
  // One key per outreach mailbox (ADR-016). z.custom keeps the type narrow (a plain regex string would widen ProviderId to string).
  z.custom<`outreach-mailbox:${string}`>(
    (value) => typeof value === "string" && /^outreach-mailbox:[a-z0-9]{20,32}$/.test(value),
    { error: "Use outreach-mailbox:<mailboxId>" },
  ),
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** Severity order, lowest to highest. Comparisons (">= HIGH") use this order. */
export const SEVERITY_ORDER = [
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly E.FindingSeverity[];

// ---- Identifiers and time ----
/** Prisma @default(cuid()). The same pattern as Zod's (deprecated) z.cuid(): "c" then 6+ lower-case alphanumerics. */
export const IdSchema = z.string().regex(/^[cC][0-9a-z]{6,}$/, { error: "Invalid id" });
export type Id = z.infer<typeof IdSchema>;
export const Iso8601Schema = z.iso.datetime(); // UTC, "Z" suffix, no offsets (Zod 4 default)
export type Iso8601 = z.infer<typeof Iso8601Schema>;
export const IsoDateSchema = z.iso.date(); // "2026-10-03" (date-only values)
export const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM (24h)" });
export const IanaTimezoneSchema = z.string().min(3).max(64); // validated at runtime with Intl.supportedValuesOf("timeZone")
export const CountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, { error: "ISO 3166-1 alpha-2, upper case" });
export type CountryCode = z.infer<typeof CountryCodeSchema>;
export const E164Schema = z.e164(); // "+2348031234567"
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });
export const SlugIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, { error: "snake_case id" });
export const KebabIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/, { error: "kebab-case id" });

/** Injectable clock (wave-3 B4). Business logic never calls Date.now() directly. */
export interface Clock {
  now(): Date;
}

// ---- Money (INV-11) ----
/** Minor units per currency: all four supported currencies use 2 (kobo, cents, pence, cents). */
export const CURRENCY_EXPONENT = { NGN: 2, USD: 2, GBP: 2, EUR: 2 } as const satisfies Record<
  E.Currency,
  number
>;
export const CURRENCY_SYMBOL = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" } as const satisfies Record<
  E.Currency,
  string
>;
export const MARKET_CURRENCIES = {
  NIGERIA: ["NGN"],
  INTERNATIONAL: ["USD", "GBP", "EUR"],
} as const satisfies Record<E.Market, readonly E.Currency[]>;

export const MinorUnitsSchema = z.int().nonnegative(); // integers only, never floats
export const MoneySchema = z.object({ amountMinor: MinorUnitsSchema, currency: CurrencySchema });
export type Money = z.infer<typeof MoneySchema>;
/** Totals per currency. Never summed across currencies, never converted. */
export const MoneyByCurrencySchema = z.partialRecord(CurrencySchema, MinorUnitsSchema);
export type MoneyByCurrency = z.infer<typeof MoneyByCurrencySchema>;

/** Implemented in src/lib/money.ts. Signatures fixed here. */
export type FormatMoney = (
  money: Money,
  opts?: { compact?: boolean; showMinor?: "auto" | "always" },
) => string;
/** Parses a human decimal string ("1,250.50") to minor units. Throws VALIDATION_FAILED on more decimals than the exponent allows. Never uses float arithmetic. */
export type ToMinor = (major: string, currency: E.Currency) => number;
/** Minor units to a plain decimal string ("1250.50"), never a float. */
export type FromMinor = (minor: number, currency: E.Currency) => string;

// ---- Internal cost accounting (ADR-027) ----
/** Integer micro-USD (1 USD = 1_000_000). Used for AI calls, provider calls, audits and captures. Not customer money. */
export const CostMicrosSchema = z.int().nonnegative();
export type CostMicros = z.infer<typeof CostMicrosSchema>;

// ---- Actor (who did it) ----
export const UserActorSchema = z.object({
  type: z.literal("USER"),
  userId: IdSchema,
  role: RoleSchema, // resolved from the database at request time, never from the client
});
export const SystemActorSchema = z.object({
  type: z.literal("SYSTEM"),
  job: z.string().regex(/^[a-z]+\.[a-z0-9.-]+$/), // job or subsystem name, e.g. "acquisition.outreach.tick"
  jobRunId: IdSchema.optional(),
});
export const ActorSchema = z.discriminatedUnion("type", [UserActorSchema, SystemActorSchema]);
export type Actor = z.infer<typeof ActorSchema>;

// ---- Errors: APP_ERROR_STATUS and AppErrorCode come from src/lib/errors.ts (re-exported above). ----
export const AppErrorCodeSchema = z.enum(
  Object.keys(APP_ERROR_STATUS) as [AppErrorCode, ...AppErrorCode[]],
);
export const AppErrorShapeSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string().max(500),
  status: z.int(),
  details: z.record(z.string(), z.unknown()).optional(), // validation errors carry details.fields
});
export type AppErrorShape = z.infer<typeof AppErrorShapeSchema>;

// ---- Cursor pagination (saas-api / saas-data) ----
export const CursorPageInputSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.int().min(1).max(100).default(25),
});
export type CursorPageInput = z.infer<typeof CursorPageInputSchema>;
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---- JSON value (for typed JSON columns that hold arbitrary provider payloads) ----
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
