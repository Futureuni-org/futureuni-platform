# Contract: Outreach channels

| | |
|---|---|
| Module | `src/contracts/outreach-channel.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 12 (`src/modules/acquisition/outreach/`: `EmailSender`, mailboxes, send path, assisted channels, unsubscribe) and Phase 13 (`src/modules/acquisition/inbox/`: `InboundReplySource`) |
| Consumers | 13 and 14 (one-off sends, stop/pause/bounce seams), 15 (review queue, assisted flows), 16 (conversation), 18 (mailbox screens), 20 (hardening) |
| Decisions | ADR-016 (sender and reply ingestion: `gmail-api` default, `smtp` fallback, `mock`), ADR-031 (no open or click tracking by default), ADR-032 (INV-9 covers ACTIVE and PAUSED) |
| Not this | Platform or transactional email (invites, resets, digests) is Phase 6's separate adapter, `resend` or `mock` (ADR-023). The two are never mixed. |

## 1. Purpose

How FUTUREUNI reaches prospects safely:
- one **email send path** from dedicated outreach mailboxes, with warm-up, caps, send windows, threading and RFC 8058 unsubscribe
- **assisted channels** (WhatsApp click-to-chat, LinkedIn copy-and-open, call tasks) where a human always does the final send
- **reply ingestion** from the same mailboxes

## 2. Types and schemas

```ts
// src/contracts/outreach-channel.ts
import { z } from "zod";
import {
  IdSchema, Iso8601Schema, IsoDateSchema, TimeOfDaySchema, IanaTimezoneSchema, HttpUrlSchema, E164Schema,
  EnrollmentStopReasonSchema, EnrollmentPauseReasonSchema, TrackingEventTypeSchema, MailboxStatusSchema, ProviderIdSchema, ChannelSchema,
  type Actor, type Clock, type ProviderId,
} from "./common";

// ---------- Outbound email ----------
export const EmailAddressSchema = z.object({ address: z.email(), name: z.string().max(120).optional() });

export const OutboundEmailSchema = z.object({
  messageId: IdSchema,                               // our Message.id; also the idempotency key (INV-22)
  from: EmailAddressSchema,                          // the mailbox; display name = the sender's real name
  to: EmailAddressSchema,
  replyTo: z.email().optional(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1),                           // plain text body incl. the system footer; citation markers removed
  html: z.string().optional(),                       // optional minimal HTML version of the same content
  headers: z.object({
    "Message-ID": z.string().regex(/^<[^<>@\s]+@[^<>\s]+>$/),
    "In-Reply-To": z.string().optional(),
    "References": z.string().optional(),
    "List-Unsubscribe": z.string().regex(/^<https:\/\/[^>]+>(, <mailto:[^>]+>)?$/),
    "List-Unsubscribe-Post": z.literal("List-Unsubscribe=One-Click"),
  }),
  attachments: z.array(z.object({ filename: z.string().max(200), contentType: z.string(), fileKey: z.string() })).max(5).default([]),
  providerThreadId: z.string().optional(),           // keep follow-ups in the same provider thread
});
export type OutboundEmail = z.infer<typeof OutboundEmailSchema>;

export const SendResultSchema = z.object({
  providerMessageId: z.string(), providerThreadId: z.string().optional(), rfcMessageId: z.string(), acceptedAt: Iso8601Schema,
});
export interface EmailSender {
  id: "gmail-api" | "smtp" | "mock";
  /** Sends exactly once per messageId: a repeat call with the same messageId returns the first result (INV-22). */
  send(email: OutboundEmail, ctx: { mailboxId: string; credentialProvider: ProviderId; clock: Clock }): Promise<z.infer<typeof SendResultSchema>>;
}

// ---------- Mailboxes, warm-up, caps and windows ----------
export const MailboxConfigSchema = z.object({
  id: IdSchema, address: z.email(), displayName: z.string().max(120),
  provider: z.enum(["gmail-api", "smtp", "mock"]),
  credentialProvider: ProviderIdSchema,              // credentials vault key "outreach-mailbox:<mailboxId>" (common.md rule 9)
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
  timezone: IanaTimezoneSchema,                      // the recipient's timezone
  days: z.array(z.int().min(1).max(7)).default([1, 2, 3, 4, 5]),   // ISO weekday, Mon=1
  start: TimeOfDaySchema.default("09:00"),
  end: TimeOfDaySchema.default("17:00"),
  jitterMinutes: z.int().min(0).max(60).default(20),
});
export type SendWindow = z.infer<typeof SendWindowSchema>;
/** Next allowed send instant ≥ `from` inside the window (UTC). */
export type NextSendSlot = (window: SendWindow, from: Date, rng?: () => number) => Date;
/** Recipient timezone: NG → Africa/Lagos; single-zone countries → their zone; multi-zone → by city, else the capital's zone. */
export type ResolveRecipientTimezone = (input: { country: string | null; city: string | null; region: string | null }) => string;

// ---------- Unsubscribe (RFC 8058) ----------
export const UnsubscribeTokenPayloadSchema = z.object({
  v: z.literal(1),
  tid: IdSchema,                                     // Message.unsubscribeTokenId (revocable)
  mid: IdSchema,                                     // Message.id
  cid: IdSchema,                                     // Contact.id
  scope: z.enum(["COMPANY", "CONTACT"]),             // setting acquisition.unsubscribeScope at send time: governs the SUPPRESSION breadth only (rule 4)
});
/** token = base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(payload, UNSUBSCRIBE_TOKEN_SECRET)). No expiry; revocable. */
export type SignUnsubscribeToken = (p: z.infer<typeof UnsubscribeTokenPayloadSchema>) => string;
export type VerifyUnsubscribeToken = (token: string) => z.infer<typeof UnsubscribeTokenPayloadSchema> | null;

// ---------- Provider events (bounces, complaints) ----------
export const OutboundProviderEventSchema = z.object({
  provider: z.string(), eventId: z.string(), type: TrackingEventTypeSchema,
  providerMessageId: z.string().optional(), email: z.email().optional(), occurredAt: Iso8601Schema,
  detail: z.string().max(500).optional(),
});

// ---------- Assisted channels (a human always sends; INV-7) ----------
export const WhatsAppDraftSchema = z.object({
  text: z.string().min(1).max(600),                  // first line identifies FUTUREUNI; at most one link (portfolio or booking)
  to: E164Schema,                                    // confirmed or likely WhatsApp number
});
/** Returns `https://wa.me/<E.164 digits without +>?text=<encodeURIComponent(text)>`. Never calls a WhatsApp API. */
export type BuildWhatsAppLink = (draft: z.infer<typeof WhatsAppDraftSchema>) => string;
export const LinkedInPrepSchema = z.object({ text: z.string().min(1).max(300), companyPageUrl: HttpUrlSchema });
export const CallTaskSchema = z.object({ phone: E164Schema, talkingPoints: z.array(z.string().max(200)).min(1).max(6) });

/** Stored on Message.assistedOutcome when a human confirms an assisted send or logs a call. */
export const AssistedOutcomeSchema = z.object({
  channel: ChannelSchema.extract(["WHATSAPP_ASSISTED", "LINKEDIN_ASSISTED", "CALL_TASK"]),
  sentAt: Iso8601Schema,
  sentById: IdSchema,
  callOutcome: z.enum(["CONNECTED", "NO_ANSWER", "VOICEMAIL", "WRONG_NUMBER", "CALLBACK_REQUESTED"]).optional(),
  note: z.string().max(500).optional(),
});
export type AssistedOutcome = z.infer<typeof AssistedOutcomeSchema>;

// ---------- Inbound replies ----------
export const InboundEmailSchema = z.object({
  providerMessageId: z.string(), providerThreadId: z.string().optional(), rfcMessageId: z.string().optional(),
  inReplyTo: z.string().optional(), references: z.array(z.string()).default([]),
  from: EmailAddressSchema, to: z.array(EmailAddressSchema).min(1), cc: z.array(EmailAddressSchema).default([]),
  subject: z.string().max(500), date: Iso8601Schema,
  headers: z.record(z.string(), z.string()),         // subset: Auto-Submitted, X-Autoreply, Precedence, Content-Type, Return-Path
  textBody: z.string(), htmlBody: z.string().optional(),
  attachments: z.array(z.object({ filename: z.string(), contentType: z.string(), sizeBytes: z.int().nonnegative() })).default([]),
  isDeliveryStatusNotification: z.boolean(),
});
export type InboundEmail = z.infer<typeof InboundEmailSchema>;
export interface InboundReplySource {
  id: "gmail-api" | "imap" | "mock";
  /** Returns messages after `cursor` (Gmail historyId or IMAP UID) and the next cursor. Never returns our own sent copies. */
  poll(mailbox: { id: string; address: string; credentialProvider: ProviderId }, cursor: string | null, ctx: { clock: Clock; signal: AbortSignal }):
    Promise<{ messages: InboundEmail[]; nextCursor: string }>;
  /** Optional push: verifies and parses a provider notification (e.g. Gmail watch via Pub/Sub). */
  parsePush?(req: { headers: Record<string, string>; rawBody: string }): Promise<{ mailboxAddress: string; eventId: string } | null>;
}

// ---------- Shared seam types (wave-3 guide, Part B2; signatures fixed there) ----------
export const StopScopeSchema = z.object({ leadId: IdSchema.optional(), contactId: IdSchema.optional(), companyId: IdSchema.optional() })
  .refine((s) => Boolean(s.leadId || s.contactId || s.companyId), { error: "Give at least one of leadId, contactId, companyId" });
export type StopEnrollments = (tx: unknown | null, scope: z.infer<typeof StopScopeSchema>, reason: z.infer<typeof EnrollmentStopReasonSchema>) => Promise<{ stopped: number }>;
export type PauseEnrollment = (tx: unknown | null, leadId: string, until: Date, reason: z.infer<typeof EnrollmentPauseReasonSchema>) => Promise<void>;
export const SendOneOffInputSchema = z.object({
  leadId: IdSchema, contactId: IdSchema, subject: z.string().min(1).max(200), body: z.string().min(1).max(20_000),
  inReplyToMessageId: IdSchema.optional(),
  attachments: z.array(z.object({ fileKey: z.string(), filename: z.string().max(200) })).max(5).optional(),
  humanConfirmedClaims: z.boolean(),                   // matches SEAM-SEND-ONEOFF exactly; the service throws VALIDATION_FAILED unless true (rule 15)
});
export type SendOneOffEmail = (actor: Actor, input: z.infer<typeof SendOneOffInputSchema>) => Promise<{ messageId: string }>;
export const BounceInputSchema = z.object({
  messageId: IdSchema.optional(), providerMessageId: z.string().optional(), email: z.email(),
  kind: z.enum(["HARD", "SOFT"]), detail: z.string().max(500),
});
export type RecordBounce = (tx: unknown | null, input: z.infer<typeof BounceInputSchema>) => Promise<void>;
```

## 3. Rules

1. **One send path.** Every automatic or one-off outreach email goes through Phase 12's single `sendEmailMessage(messageId)`. No other code sends outreach email. Its steps, in order:
   1. Load the message, lead, contact and company.
   2. Check the global pause (`acquisition.outreach.globalPause`). If set, fail with `OUTREACH_PAUSED`.
   3. `assertNotSuppressed` on the email, phone and domain (INV-2).
   4. `assertEmailAllowed` (INV-6).
   5. Check that no cited finding is dismissed (INV-18).
   6. Check the recipient's send window. If outside it, reschedule to the next slot (INV-8).
   7. Pick a mailbox under its cap. If none has capacity, reschedule (INV-8).
   8. Build the MIME message with the system footer and the headers below (INV-4).
   9. Send, using the message ID as the idempotency key (INV-22).
   10. Store `providerMessageId`, `mailboxId` and `sentAt`, transition `APPROVED → CONTACTED` on a first touch, and emit the event.
2. **Footer (INV-4).** The system, never the model, appends:
   - the sender's signature (name, title, FUTUREUNI)
   - an unsubscribe line linking to `/u/<token>`
   - the postal address from `platform.postalAddress`

   If the postal address is empty, sending is blocked.
3. **Headers (RFC 8058).** Every outreach email carries:
   - `List-Unsubscribe: <https://<APP_URL>/api/unsubscribe/<token>>, <mailto:<unsubscribe address>?subject=unsubscribe>`
   - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
   - a unique `Message-ID`
   - `In-Reply-To` and `References` on follow-ups
4. **One-click unsubscribe** (`POST /api/unsubscribe/[token]`) needs no session and no confirmation step, and is idempotent.
   - It verifies the token. A tampered or unknown token returns 404 `NOT_FOUND` and changes nothing.
   - It adds the suppression (reason `UNSUBSCRIBE`, source `ONE_CLICK`). The token's scope (setting `acquisition.unsubscribeScope`) decides only how broad the **suppression** is: `CONTACT` adds an `EMAIL` suppression for the address; `COMPANY` also adds a `DOMAIN` suppression for the company's domain, skipped for webmail domains.
   - It **always** stops every `ACTIVE` or `PAUSED` enrolment at the company (`stopEnrollments({ companyId }, "UNSUBSCRIBE")`, INV-3), whatever the scope.
   - It returns 200. It never triggers a reply (INV-23). The `/u/[token]` page confirms on load through the same service.
5. **Warm-up and caps.** Today's cap comes from `DailyCapFor`. `MailboxDailyStat.sent` is incremented atomically with a guard `sent < cap` in the same transaction that claims the message for sending, so parallel sends can't pass the cap.
6. **Rotation.** The send path picks the active mailbox with the most remaining capacity today. A lead's thread always stays on the mailbox that sent its first touch (`Enrollment.mailboxId`).
7. **Health.** A mailbox is auto-paused when the hard-bounce rate over its last 100 sends exceeds the threshold (default 3%). Pausing notifies admins (`mailbox.paused`) and emits the event.
8. **Send windows.**
   - The recipient's timezone comes from the company's country and city (`ResolveRecipientTimezone`). The default window is weekdays 09:00–17:00 local time, plus 0–20 minutes of random jitter.
   - Sequence step delays count business days (Monday to Friday) in the recipient's country.
9. **Bounces.** A hard bounce adds an `EMAIL` suppression through Phase 9's `addSuppression`, stops enrolments, and marks the contact's email `INVALID`. A soft bounce retries twice, then counts as hard.
10. **Tracking.** There are no open pixels and no link rewriting by default (ADR-031). Metrics come from sends, replies, bounces and meetings. Provider delivery and bounce webhooks (`/api/webhooks/outbound/[provider]`) verify their signature on the raw body, dedupe by `WebhookEvent (provider, eventId)`, acknowledge quickly and process asynchronously.
11. **Assisted channels (INV-7).**
    - `prepareWhatsApp` returns a `wa.me` link, and the message becomes `PREPARED`.
    - A human sends it and confirms with `markAssistedSent`: the message becomes `SENT_ASSISTED`, `AssistedOutcome` is stored, and a first touch moves the lead to `CONTACTED`.
    - Suppression and contactability checks run before the link is generated (INV-2).
    - LinkedIn returns text plus the company page URL. A call task returns talking points and records an outcome.
    - Nothing ever calls a WhatsApp or LinkedIn API.
12. **One active thread per company (INV-9).** A partial unique index on `Enrollment(companyId) WHERE status IN ('ACTIVE','PAUSED')` enforces it (ADR-032). `enroll` treats the unique violation as a clean refusal.
13. **Stop and pause.**
    - A reply, bounce or unsubscribe stops every `ACTIVE` or `PAUSED` enrolment at the **company** (INV-3): callers use `stopEnrollments({ companyId }, reason)`, and so do meeting booked, won and lost. The `leadId` and `contactId` scopes exist for the fixed seam signature and for manual stops.
    - The one exception is an `OUT_OF_OFFICE` auto-reply, which pauses (`pauseEnrollment(tx, leadId, until, "OUT_OF_OFFICE")`) until the return date (+1 business day; default +7 days) and never counts as a reply. Resuming continues at the same step. A `NOT_NOW` reply stops like any other reply, and the lead moves to `NURTURE`. `EnrollmentPauseReason.NOT_NOW` stays in the enum because the SEAM-PAUSE-SEQUENCE signature is fixed, but it isn't used by default.
14. **Reply ingestion.**
    - `poll` is called every 5 minutes per mailbox with the stored cursor (`MailboxSyncState`). Reprocessing is idempotent on `(mailboxId, providerMessageId)`.
    - Our own sent copies and internal addresses are ignored.
    - WhatsApp and LinkedIn replies are never read automatically. A human logs them.
15. **One-off emails** (inbox replies, proposals) use the same path, checks and thread mailbox. The input type carries `humanConfirmedClaims: boolean` (the fixed SEAM-SEND-ONEOFF signature), and the service throws `VALIDATION_FAILED` unless it's `true`. Human-written one-offs rely on this confirmation instead of citation markers (INV-5 scope in project-rules).

## 4. Worked example

```ts
OutboundEmailSchema.parse({
  messageId: "cm1msg00000000000000000001",
  from: { address: "tolu@outreach-a.example", name: "Tolu Adeyemi" },
  to: { address: "owner@example.co.uk", name: "Sam Carter" },
  subject: "Your homepage on mobile",
  text: "Hi Sam,\n\nYour homepage took 7.2s to show its main content on mobile in our test on 3 Oct.\n…\n\n—\nTolu Adeyemi, FUTUREUNI\nDon't want these emails? Unsubscribe: https://app.futureuni.example/u/eyJ2IjoxfQ.sig\n<postal address>",
  headers: {
    "Message-ID": "<cm1msg00000000000000000001@outreach-a.example>",
    "List-Unsubscribe": "<https://app.futureuni.example/api/unsubscribe/eyJ2IjoxfQ.sig>, <mailto:unsubscribe@outreach-a.example?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
  attachments: [],
});

buildWhatsAppLink({ to: "+2348031234567", text: "Hello, this is Tolu from FUTUREUNI in Lagos.\nWe looked at your Instagram…" });
// → "https://wa.me/2348031234567?text=Hello%2C%20this%20is%20Tolu%20from%20FUTUREUNI%20in%20Lagos.%0AWe%20looked%20at%20your%20Instagram%E2%80%A6"
```

## 5. Invalid example (Phase 2 test)

```ts
OutboundEmailSchema.safeParse({ ...valid, headers: { "Message-ID": "<x@y.com>", "List-Unsubscribe": "<mailto:u@y.com>" } });
// → fails: ["headers","List-Unsubscribe"] must start with an https URL;
//          ["headers","List-Unsubscribe-Post"] required ("List-Unsubscribe=One-Click")
```
