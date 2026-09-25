# Contract: Common primitives

| | |
|---|---|
| Module | `src/contracts/common.ts` |
| Types written by | Phase 2 (from this file, without redesign) |
| Consumers | Every other contract, every phase |
| Change policy | Additive changes only, through `phases/<nn>/REQUESTS.md`, applied at merge |

## 1. Purpose

These are the shared building blocks every other contract imports. Enums re-export the Prisma enums, so the database schema stays the single source of truth for enum values (`docs/specs/data-model.md` §Enums). All other contract files import enums from `./common`, never from the Prisma client directly.

## 2. Types and schemas

```ts
// src/contracts/common.ts
import { z } from "zod";
// Only this file imports from the Prisma client. Prisma 7's `prisma-client` generator emits the enums as
// `export const X = { … } as const; export type X = (typeof X)[keyof typeof X]` (ADR-019). Phase 2 confirms the
// exact generated path; with the legacy generator it would be "@prisma/client".
import * as E from "@/generated/prisma/enums";
export * from "@/generated/prisma/enums";      // every database enum, as value and type (data-model.md §3)

// ---- Enum schemas: one per database enum (Zod 4 accepts enum-like objects in z.enum) ----
// Other contracts import these schemas; none redeclares an enum's values (rule 1).
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
  z.enum(["anthropic", "google-places", "pagespeed", "youtube-data", "serpapi", "adzuna", "hunter", "companies-house", "resend", "cal-com", "browser"]),   // "browser" = ProviderUsage counter for captures (no vault entry; Sandbox uses OIDC)
  // one key per outreach mailbox (ADR-016); z.custom keeps the type narrow (a plain regex string would widen ProviderId to string)
  z.custom<`outreach-mailbox:${string}`>((v) => typeof v === "string" && /^outreach-mailbox:[a-z0-9]{20,32}$/.test(v), { error: "Use outreach-mailbox:<mailboxId>" }),
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;   // "anthropic" | … | "browser" | `outreach-mailbox:${string}`

// Severity order, lowest to highest. Comparisons (">= HIGH") use this order.
export const SEVERITY_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly E.FindingSeverity[];

// ---- Identifiers and time ----
export const IdSchema = z.cuid();                        // Prisma @default(cuid())
export type Id = z.infer<typeof IdSchema>;
export const Iso8601Schema = z.iso.datetime();           // UTC, "Z" suffix, no offsets (Zod 4 default)
export type Iso8601 = z.infer<typeof Iso8601Schema>;
export const IsoDateSchema = z.iso.date();               // "2026-10-03" (date-only values)
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Use HH:MM (24h)" });
export const IanaTimezoneSchema = z.string().min(3).max(64); // validated at runtime with Intl.supportedValuesOf("timeZone")
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, { error: "ISO 3166-1 alpha-2, upper case" });
export type CountryCode = z.infer<typeof CountryCodeSchema>;
export const E164Schema = z.e164();                      // "+2348031234567"
export const HttpUrlSchema = z.url({ protocol: /^https?$/ });
export const SlugIdSchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, { error: "snake_case id" });
export const KebabIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/, { error: "kebab-case id" });

/** Injectable clock (wave-3 B4). Business logic never calls Date.now() directly. */
export interface Clock { now(): Date }

// ---- Money (INV-11) ----
/** Minor units per currency: all four supported currencies use 2 (kobo, cents, pence, cents). */
export const CURRENCY_EXPONENT = { NGN: 2, USD: 2, GBP: 2, EUR: 2 } as const satisfies Record<E.Currency, number>;
export const CURRENCY_SYMBOL = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" } as const satisfies Record<E.Currency, string>;
export const MARKET_CURRENCIES = { NIGERIA: ["NGN"], INTERNATIONAL: ["USD", "GBP", "EUR"] } as const satisfies Record<E.Market, readonly E.Currency[]>;

export const MinorUnitsSchema = z.int().nonnegative();   // integers only, never floats
export const MoneySchema = z.object({ amountMinor: MinorUnitsSchema, currency: CurrencySchema });
export type Money = z.infer<typeof MoneySchema>;
/** Totals per currency. Never summed across currencies, never converted. */
export const MoneyByCurrencySchema = z.partialRecord(CurrencySchema, MinorUnitsSchema);
export type MoneyByCurrency = z.infer<typeof MoneyByCurrencySchema>;

/** Implemented in src/lib/money.ts (Phase 1 grants src/lib to itself; Phase 2 may add it through its grant). Signatures fixed here. */
export type FormatMoney = (money: Money, opts?: { compact?: boolean; showMinor?: "auto" | "always" }) => string;
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
  role: RoleSchema,                                   // resolved from the database at request time, never from the client
});
export const SystemActorSchema = z.object({
  type: z.literal("SYSTEM"),
  job: z.string().regex(/^[a-z]+\.[a-z0-9.-]+$/),     // job or subsystem name, e.g. "acquisition.outreach.tick"
  jobRunId: IdSchema.optional(),
});
export const ActorSchema = z.discriminatedUnion("type", [UserActorSchema, SystemActorSchema]);
export type Actor = z.infer<typeof ActorSchema>;

// ---- Errors (the AppError class lives in src/lib/errors.ts, Phase 1) ----
export const APP_ERROR_STATUS = {
  UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION_FAILED: 422, CONFLICT: 409,
  RATE_LIMITED: 429, INVALID_TRANSITION: 409, CONTACT_BLOCKED: 409, SUPPRESSED: 409,
  OUTSIDE_SEND_WINDOW: 409, MAILBOX_CAP_REACHED: 409, OUTREACH_PAUSED: 409, CITATION_INVALID: 422,
  BUDGET_EXCEEDED: 429, PROVIDER_ERROR: 502, PROVIDER_QUOTA_EXCEEDED: 429, AI_OUTPUT_INVALID: 502,
  AI_QUOTA_EXCEEDED: 429, AI_TIMEOUT: 504, AI_PROVIDER_ERROR: 502, PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415, INTERNAL: 500,
} as const;
export const AppErrorCodeSchema = z.enum(Object.keys(APP_ERROR_STATUS) as [keyof typeof APP_ERROR_STATUS, ...(keyof typeof APP_ERROR_STATUS)[]]);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;
export const AppErrorShapeSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string().max(500),
  status: z.int(),
  details: z.record(z.string(), z.unknown()).optional(),   // validation errors carry details.fields
});
export type AppErrorShape = z.infer<typeof AppErrorShapeSchema>;

/** Server actions return this; route handlers return { error: { code, message, details? } } with the HTTP status. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: Record<string, unknown> } };

// ---- Cursor pagination (saas-api / saas-data) ----
export const CursorPageInputSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.int().min(1).max(100).default(25),
});
export type CursorPageInput = z.infer<typeof CursorPageInputSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };

// ---- JSON value (for typed JSON columns that hold arbitrary provider payloads) ----
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)]),
);
```

## 3. Rules

1. Enum values come only from the Prisma schema. A contract never declares its own copy of `ServiceLine`, `Market` or any other database enum: it imports the `<Enum>Schema` from this file, narrowing with `.extract([...])` or `.exclude([...])` where it needs a subset.
2. Every timestamp crossing a boundary (API, event, JSON column) is an `Iso8601` string in UTC with a `Z` suffix (INV-12). Date-only values use `IsoDate`.
3. Money is `{ amountMinor, currency }` with an integer amount (INV-11). `toMinor`/`fromMinor` never use floating-point arithmetic, and totals are `MoneyByCurrency`, never one summed number.
4. Currency must match the market: `NIGERIA` → `NGN`; `INTERNATIONAL` → `USD`, `GBP` or `EUR` (`MARKET_CURRENCIES`).
5. Internal costs (AI, providers, captures) are `CostMicros`, integer micro-USD (ADR-027). They are never shown as customer money.
6. `Actor.role` is resolved server-side from the database. A `SYSTEM` actor names the job or subsystem acting.
7. Error codes are only those in `APP_ERROR_STATUS`. New codes need a request.
8. `formatMoney` follows `.claude/project-rules.md` §"Output/document rules". Examples in the UI (`showMinor: "auto"`, the default): `{25000000, NGN}` → `₦250,000`; `{125050, GBP}` → `£1,250.50`; `{120000, USD}` → `$1,200`. In documents (`showMinor: "always"`), USD, GBP and EUR always show two decimals (`{480000, USD}` → `$4,800.00`), while NGN shows whole naira unless there are kobo. Compact form (`compact: true`) is for charts, board totals and stat rows only (`₦4.2m`, `$6.8k`).
9. **Provider IDs** (`ProviderIdSchema`) name credentials vault entries and `ProviderUsage.provider` rows. They differ from adapter IDs where several adapters share one account: `jobs-serpapi` → `serpapi`, `jobs-adzuna` → `adzuna`, `youtube-channels` and `audit.video` → `youtube-data`, `google-places` → `google-places`. Outreach mailboxes use one key each: `outreach-mailbox:<mailboxId>`.

## 4. Worked example

```ts
MoneySchema.parse({ amountMinor: 25_000_000, currency: "NGN" });      // ₦250,000
ActorSchema.parse({ type: "USER", userId: "cm1f2k3j40000abcd1234efgh", role: "SERVICE_LEAD" });
ActorSchema.parse({ type: "SYSTEM", job: "acquisition.outreach.tick", jobRunId: "cm1f2k3j40001abcd1234efgh" });
Iso8601Schema.parse("2026-10-03T08:15:00Z");
```

## 5. Invalid example (Phase 2 test)

```ts
MoneySchema.safeParse({ amountMinor: 1250.5, currency: "GBP" });
// → fails at path ["amountMinor"]: expected int, received float (money is integer minor units)
Iso8601Schema.safeParse("2026-10-03T09:15:00+01:00");
// → fails: offsets are not allowed; timestamps are UTC with "Z"
```
