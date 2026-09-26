/**
 * Contract: outreach channels (docs/contracts/outreach-channel.md). Implemented by Phase 12
 * (EmailSender, mailboxes, the send path, assisted channels, unsubscribe) and Phase 13
 * (InboundReplySource). Platform (transactional) email is Phase 6's separate adapter.
 */

import { z } from "zod";

import {
  ChannelSchema,
  E164Schema,
  type EnrollmentPauseReasonSchema,
  type EnrollmentStopReasonSchema,
  HttpUrlSchema,
  IanaTimezoneSchema,
  IdSchema,
  Iso8601Schema,
  IsoDateSchema,
  MailboxStatusSchema,
  ProviderIdSchema,
  TimeOfDaySchema,
  TrackingEventTypeSchema,
  type Actor,
  type Clock,
  type ProviderId,
} from "./common";

// ---------- Outbound email ----------
export const EmailAddressSchema = z.object({
  address: z.email(),
  name: z.string().max(120).optional(),
});

export const OutboundEmailSchema = z.object({
  messageId: IdSchema, // our Message.id; also the idempotency key (INV-22)
  from: EmailAddressSchema, // the mailbox; display name = the sender's real name
  to: EmailAddressSchema,
  replyTo: z.email().optional(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1), // plain text body incl. the system footer; citation markers removed
  html: z.string().optional(), // optional minimal HTML version of the same content
  headers: z.object({
    "Message-ID": z.string().regex(/^<[^<>@\s]+@[^<>\s]+>$/),
    "In-Reply-To": z.string().optional(),
    References: z.string().optional(),
    "List-Unsubscribe": z.string().regex(/^<https:\/\/[^>]+>(, <mailto:[^>]+>)?$/),
    "List-Unsubscribe-Post": z.literal("List-Unsubscribe=One-Click"),
  }),
  attachments: z
    .array(
      z.object({ filename: z.string().max(200), contentType: z.string(), fileKey: z.string() }),
    )
    .max(5)
    .default([]),
  providerThreadId: z.string().optional(), // keep follow-ups in the same provider thread
});
export type OutboundEmail = z.infer<typeof OutboundEmailSchema>;

export const SendResultSchema = z.object({
  providerMessageId: z.string(),
  providerThreadId: z.string().optional(),
  rfcMessageId: z.string(),
  acceptedAt: Iso8601Schema,
});
export interface EmailSender {
  id: "gmail-api" | "smtp" | "mock";
  /** Sends exactly once per messageId: a repeat call with the same messageId returns the first result (INV-22). */
  send(
    email: OutboundEmail,
    ctx: { mailboxId: string; credentialProvider: ProviderId; clock: Clock },
  ): Promise<z.infer<typeof SendResultSchema>>;
}

// ---------- Mailboxes, warm-up, caps and windows ----------
export const MailboxConfigSchema = z.object({
  id: IdSchema,
  address: z.email(),
  displayName: z.string().max(120),
  provider: z.enum(["gmail-api", "smtp", "mock"]),
  credentialProvider: ProviderIdSchema, // credentials vault key "outreach-mailbox:<mailboxId>" (common.md rule 9)
  status: MailboxStatusSchema,
  warmupStartDate: IsoDateSchema,
  warmupStartCap: z.int().min(1).default(5),
  dailyCapTarget: z.int().min(1).max(200).default(35),
  warmupRampDays: z.int().min(1).max(60).default(24),
  sendWindowStart: TimeOfDaySchema.default("09:00"),
  sendWindowEnd: TimeOfDaySchema.default("17:00"),
});
export type MailboxConfig = z.infer<typeof MailboxConfigSchema>;
/**
 * Today's cap: day n = whole days since warmupStartDate (0-based, calendar days in Africa/Lagos).
 * cap = min(dailyCapTarget, warmupStartCap + floor(n × (dailyCapTarget − warmupStartCap) / warmupRampDays)).
 */
export type DailyCapFor = (mailbox: MailboxConfig, day: string /* IsoDate */) => number;

export const SendWindowSchema = z.object({
  timezone: IanaTimezoneSchema, // the recipient's timezone
  days: z.array(z.int().min(1).max(7)).default([1, 2, 3, 4, 5]), // ISO weekday, Mon=1
  start: TimeOfDaySchema.default("09:00"),
  end: TimeOfDaySchema.default("17:00"),
  jitterMinutes: z.int().min(0).max(60).default(20),
});
export type SendWindow = z.infer<typeof SendWindowSchema>;
/** Next allowed send instant ≥ `from` inside the window (UTC). */
export type NextSendSlot = (window: SendWindow, from: Date, rng?: () => number) => Date;
/** Recipient timezone: NG → Africa/Lagos; single-zone countries → their zone; multi-zone → by city, else the capital's zone. */
export type ResolveRecipientTimezone = (input: {
  country: string | null;
  city: string | null;
  region: string | null;
}) => string;

// ---------- Unsubscribe (RFC 8058) ----------
export const UnsubscribeTokenPayloadSchema = z.object({
  v: z.literal(1),
  tid: IdSchema, // Message.unsubscribeTokenId (revocable)
  mid: IdSchema, // Message.id
  cid: IdSchema, // Contact.id
  scope: z.enum(["COMPANY", "CONTACT"]), // setting acquisition.unsubscribeScope at send time: governs the SUPPRESSION breadth only (rule 4)
});
/** token = base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(payload, UNSUBSCRIBE_TOKEN_SECRET)). No expiry; revocable. */
export type SignUnsubscribeToken = (p: z.infer<typeof UnsubscribeTokenPayloadSchema>) => string;
export type VerifyUnsubscribeToken = (
  token: string,
) => z.infer<typeof UnsubscribeTokenPayloadSchema> | null;

// ---------- Provider events (bounces, complaints) ----------
export const OutboundProviderEventSchema = z.object({
  provider: z.string(),
  eventId: z.string(),
  type: TrackingEventTypeSchema,
  providerMessageId: z.string().optional(),
  email: z.email().optional(),
  occurredAt: Iso8601Schema,
  detail: z.string().max(500).optional(),
});

// ---------- Assisted channels (a human always sends; INV-7) ----------
export const WhatsAppDraftSchema = z.object({
  text: z.string().min(1).max(600), // first line identifies FUTUREUNI; at most one link (portfolio or booking)
  to: E164Schema, // confirmed or likely WhatsApp number
});
/** Returns `https://wa.me/<E.164 digits without +>?text=<encodeURIComponent(text)>`. Never calls a WhatsApp API. */
export type BuildWhatsAppLink = (draft: z.infer<typeof WhatsAppDraftSchema>) => string;
export const LinkedInPrepSchema = z.object({
  text: z.string().min(1).max(300),
  companyPageUrl: HttpUrlSchema,
});
export const CallTaskSchema = z.object({
  phone: E164Schema,
  talkingPoints: z.array(z.string().max(200)).min(1).max(6),
});

/** Stored on Message.assistedOutcome when a human confirms an assisted send or logs a call. */
export const AssistedOutcomeSchema = z.object({
  channel: ChannelSchema.extract(["WHATSAPP_ASSISTED", "LINKEDIN_ASSISTED", "CALL_TASK"]),
  sentAt: Iso8601Schema,
  sentById: IdSchema,
  callOutcome: z
    .enum(["CONNECTED", "NO_ANSWER", "VOICEMAIL", "WRONG_NUMBER", "CALLBACK_REQUESTED"])
    .optional(),
  note: z.string().max(500).optional(),
});
export type AssistedOutcome = z.infer<typeof AssistedOutcomeSchema>;

// ---------- Inbound replies ----------
export const InboundEmailSchema = z.object({
  providerMessageId: z.string(),
  providerThreadId: z.string().optional(),
  rfcMessageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).default([]),
  from: EmailAddressSchema,
  to: z.array(EmailAddressSchema).min(1),
  cc: z.array(EmailAddressSchema).default([]),
  subject: z.string().max(500),
  date: Iso8601Schema,
  headers: z.record(z.string(), z.string()), // subset: Auto-Submitted, X-Autoreply, Precedence, Content-Type, Return-Path
  textBody: z.string(),
  htmlBody: z.string().optional(),
  attachments: z
    .array(
      z.object({ filename: z.string(), contentType: z.string(), sizeBytes: z.int().nonnegative() }),
    )
    .default([]),
  isDeliveryStatusNotification: z.boolean(),
});
export type InboundEmail = z.infer<typeof InboundEmailSchema>;
export interface InboundReplySource {
  id: "gmail-api" | "imap" | "mock";
  /** Returns messages after `cursor` (Gmail historyId or IMAP UID) and the next cursor. Never returns our own sent copies. */
  poll(
    mailbox: { id: string; address: string; credentialProvider: ProviderId },
    cursor: string | null,
    ctx: { clock: Clock; signal: AbortSignal },
  ): Promise<{ messages: InboundEmail[]; nextCursor: string }>;
  /** Optional push: verifies and parses a provider notification (e.g. Gmail watch via Pub/Sub). */
  parsePush?(req: {
    headers: Record<string, string>;
    rawBody: string;
  }): Promise<{ mailboxAddress: string; eventId: string } | null>;
}

// ---------- Shared seam types (wave-3 guide, Part B2; signatures fixed there) ----------
export const StopScopeSchema = z
  .object({
    leadId: IdSchema.optional(),
    contactId: IdSchema.optional(),
    companyId: IdSchema.optional(),
  })
  .refine((s) => Boolean(s.leadId ?? s.contactId ?? s.companyId), {
    error: "Give at least one of leadId, contactId, companyId",
  });
export type StopEnrollments = (
  tx: unknown,
  scope: z.infer<typeof StopScopeSchema>,
  reason: z.infer<typeof EnrollmentStopReasonSchema>,
) => Promise<{ stopped: number }>;
export type PauseEnrollment = (
  tx: unknown,
  leadId: string,
  until: Date,
  reason: z.infer<typeof EnrollmentPauseReasonSchema>,
) => Promise<void>;
export const SendOneOffInputSchema = z.object({
  leadId: IdSchema,
  contactId: IdSchema,
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
  inReplyToMessageId: IdSchema.optional(),
  attachments: z
    .array(z.object({ fileKey: z.string(), filename: z.string().max(200) }))
    .max(5)
    .optional(),
  humanConfirmedClaims: z.boolean(), // matches SEAM-SEND-ONEOFF exactly; the service throws VALIDATION_FAILED unless true (rule 15)
});
export type SendOneOffEmail = (
  actor: Actor,
  input: z.infer<typeof SendOneOffInputSchema>,
) => Promise<{ messageId: string }>;
export const BounceInputSchema = z.object({
  messageId: IdSchema.optional(),
  providerMessageId: z.string().optional(),
  email: z.email(),
  kind: z.enum(["HARD", "SOFT"]),
  detail: z.string().max(500),
});
export type RecordBounce = (tx: unknown, input: z.infer<typeof BounceInputSchema>) => Promise<void>;
