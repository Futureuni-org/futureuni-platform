# Contract: Domain events

| | |
|---|---|
| Module | `src/contracts/events.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 6 (`@/platform/events`: `publish`, `publishAfterCommit`, subscriber dispatch, the `DomainEvent` outbox) |
| Emitters | The phase listed per event in §3 |
| Subscribers | Phase 6 (`notification-router`, `audit-bridge`), 11 (re-scoring), 17 (cache invalidation), 19 (orchestration), and future modules (for example a Projects module on `deal.won`) |

## 1. Purpose

Modules react to each other without importing each other (ADR-002). A module publishes a typed event, and any module subscribes to it. Notifications, audit bridging, re-scoring, analytics cache invalidation and pipeline orchestration all hang off these events.

## 2. Envelope and API

```ts
// src/contracts/events.ts
import { z } from "zod";
import {
  IdSchema, Iso8601Schema, ActorSchema, ServiceLineSchema, MarketSchema, LeadStatusSchema, CurrencySchema,
  MinorUnitsSchema, ChannelSchema, ReplyClassSchema, ReplyChannelSchema, CapacityModeSchema, LostReasonSchema,
  EnrollmentStopReasonSchema, RoleSchema, CostMicrosSchema, ScoreBandSchema, SearchRunStatusSchema,
  SuppressionTypeSchema, DsrTypeSchema, AuditStatusSchema, MessageStatusSchema, ClassificationSourceSchema,
  MeetingStatusSchema, SettingScopeSchema,
} from "./common";
import { EmailVerdictSchema } from "./enrichment";
import { SearchRunCountsSchema } from "./source-adapter";

const envelope = <N extends string, P extends z.ZodType>(name: N, payload: P) =>
  z.object({
    id: IdSchema,                       // unique event id; subscribers dedupe on it
    name: z.literal(name),
    occurredAt: Iso8601Schema,
    actor: ActorSchema,
    payload,
  });

// ---- Lead lifecycle and sourcing ----
export const LeadCreated = envelope("lead.created", z.object({
  leadId: IdSchema, companyId: IdSchema, serviceLine: ServiceLineSchema, market: MarketSchema,
  source: z.string().max(80),         // adapter id | "manual:<userId>" | "csv-import"
  searchRunId: IdSchema.optional(),
}));
export const LeadStatusChanged = envelope("lead.statusChanged", z.object({
  leadId: IdSchema, leadEventId: IdSchema, from: LeadStatusSchema.nullable(), to: LeadStatusSchema,
  serviceLine: ServiceLineSchema, market: MarketSchema, reason: z.string().max(200).optional(),
}));
export const LeadAssigned = envelope("lead.assigned", z.object({
  leadId: IdSchema, fromOwnerId: IdSchema.nullable(), toOwnerId: IdSchema,
}));
export const LeadScored = envelope("lead.scored", z.object({
  leadId: IdSchema, score: z.int().min(0).max(100), band: ScoreBandSchema,
  previousScore: z.int().min(0).max(100).nullable(), needsHumanReview: z.boolean(),
}));
export const LeadNeedsAttention = envelope("lead.needsAttention", z.object({
  leadId: IdSchema, reason: z.string().max(200), restarts: z.int().nonnegative(),
}));
export const SignalRecorded = envelope("signal.recorded", z.object({
  signalId: IdSchema, companyId: IdSchema, leadId: IdSchema.nullable(), serviceLine: ServiceLineSchema, signalType: z.string(),
}));
export const SourcingRunCompleted = envelope("sourcing.run.completed", z.object({
  searchRunId: IdSchema, serviceLine: ServiceLineSchema,
  status: SearchRunStatusSchema.extract(["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED", "SKIPPED"]),
  counts: SearchRunCountsSchema,
}));

// ---- Compliance ----
export const ComplianceVerdictChanged = envelope("compliance.verdict.changed", z.object({
  leadId: IdSchema.nullable(), companyId: IdSchema, contactId: IdSchema.nullable(),
  emailFrom: EmailVerdictSchema.nullable(),
  emailTo: EmailVerdictSchema,
}));
export const ComplianceSuppressed = envelope("compliance.suppressed", z.object({
  suppressionId: IdSchema, type: SuppressionTypeSchema,
  affectedLeadIds: z.array(IdSchema), stoppedEnrollments: z.int().nonnegative(),
}));
export const ComplianceDsrCompleted = envelope("compliance.dsr.completed", z.object({
  requestId: IdSchema, type: DsrTypeSchema,
}));

// ---- Audits, profiles, scoring, capacity ----
export const AuditCompleted = envelope("audit.completed", z.object({
  leadId: IdSchema, auditIds: z.array(IdSchema), status: AuditStatusSchema.extract(["SUCCEEDED", "PARTIAL", "FAILED", "NOT_APPLICABLE"]),
  findingCount: z.int().nonnegative(), pitchableCount: z.int().nonnegative(),
}));
export const FindingDismissed = envelope("finding.dismissed", z.object({ findingId: IdSchema, leadId: IdSchema }));
export const ProfilePublished = envelope("profile.published", z.object({
  serviceLine: ServiceLineSchema, version: z.int().positive(), previousVersion: z.int().positive().nullable(),
}));
export const CrossSellDetected = envelope("crosssell.detected", z.object({
  groupId: IdSchema, companyId: IdSchema, leadIds: z.array(IdSchema).min(2), leadingLeadId: IdSchema,
}));
export const CapacityModeChanged = envelope("capacity.mode.changed", z.object({
  serviceLine: ServiceLineSchema, from: CapacityModeSchema, to: CapacityModeSchema,
}));

// ---- Outreach ----
export const MessageDrafted = envelope("message.drafted", z.object({
  messageId: IdSchema, leadId: IdSchema, stepIndex: z.int().nonnegative().nullable(), status: MessageStatusSchema.extract(["DRAFT", "NEEDS_EDIT"]),
}));
export const MessageApproved = envelope("message.approved", z.object({ messageId: IdSchema, leadId: IdSchema, auto: z.boolean() }));
export const OutreachEnrolled = envelope("outreach.enrolled", z.object({
  enrollmentId: IdSchema, leadId: IdSchema, contactId: IdSchema, sequenceId: IdSchema,
}));
export const OutreachStepSent = envelope("outreach.step.sent", z.object({
  messageId: IdSchema, leadId: IdSchema, enrollmentId: IdSchema.nullable(), channel: ChannelSchema,
  stepIndex: z.int().nonnegative().nullable(),
}));
export const OutreachEnrollmentStopped = envelope("outreach.enrollment.stopped", z.object({
  enrollmentIds: z.array(IdSchema),
  scope: z.object({ leadId: IdSchema.optional(), contactId: IdSchema.optional(), companyId: IdSchema.optional() }),
  reason: EnrollmentStopReasonSchema,
}));
export const OutreachBounceRecorded = envelope("outreach.bounce.recorded", z.object({
  emailHash: z.string().regex(/^[a-f0-9]{64}$/),   // sha256 of the normalised address; never the raw email
  kind: z.enum(["HARD", "SOFT"]), messageId: IdSchema.nullable(),
}));
export const MailboxPaused = envelope("mailbox.paused", z.object({ mailboxId: IdSchema, reason: z.string().max(200) }));

// ---- Inbox and pipeline ----
export const ReplyReceived = envelope("reply.received", z.object({
  replyId: IdSchema, leadId: IdSchema.nullable(), channel: ReplyChannelSchema, matched: z.boolean(),
}));
export const ReplyClassified = envelope("reply.classified", z.object({
  replyId: IdSchema, leadId: IdSchema.nullable(), classification: ReplyClassSchema,
  confidence: z.number().min(0).max(1), source: ClassificationSourceSchema,
}));
export const MeetingBooked = envelope("meeting.booked", z.object({
  meetingId: IdSchema, leadId: IdSchema, startsAt: Iso8601Schema, ownerId: IdSchema.nullable(),
}));
export const MeetingUpdated = envelope("meeting.updated", z.object({
  meetingId: IdSchema, leadId: IdSchema.nullable(),
  status: MeetingStatusSchema,
}));
export const ProposalSent = envelope("proposal.sent", z.object({
  proposalId: IdSchema, leadId: IdSchema, totalMinor: MinorUnitsSchema, currency: CurrencySchema,
}));
export const DealWon = envelope("deal.won", z.object({
  dealId: IdSchema, leadId: IdSchema, companyId: IdSchema, serviceLine: ServiceLineSchema, market: MarketSchema,
  valueMinor: MinorUnitsSchema, currency: CurrencySchema, services: z.array(ServiceLineSchema).min(1),
}));
export const DealLost = envelope("deal.lost", z.object({ dealId: IdSchema, leadId: IdSchema, reason: LostReasonSchema }));
export const HandoffCreated = envelope("handoff.created", z.object({ handoffId: IdSchema, dealId: IdSchema }));

// ---- Platform ----
export const SettingsChanged = envelope("settings.changed", z.object({
  key: z.string(), scope: SettingScopeSchema, userId: IdSchema.nullable(),
}));
export const JobFailed = envelope("job.failed", z.object({ jobRunId: IdSchema, name: z.string(), errorSummary: z.string().max(500) }));
export const IntegrationFailing = envelope("integration.failing", z.object({ provider: z.string(), error: z.string().max(500) }));
export const AiBudgetWarning = envelope("ai.budget.warning", z.object({
  scope: z.string(),                      // "platform.daily" | "platform.monthly" | "module:<id>.daily" | "user:<id>.daily"
  usedMicros: CostMicrosSchema, limitMicros: CostMicrosSchema, percent: z.int().min(0).max(100),
}));
export const AiBudgetExceeded = envelope("ai.budget.exceeded", z.object({
  scope: z.string(), usedMicros: CostMicrosSchema, limitMicros: CostMicrosSchema,
}));
export const UserInvited = envelope("user.invited", z.object({ inviteId: IdSchema, role: RoleSchema, invitedBy: IdSchema }));
export const UserRoleChanged = envelope("user.roleChanged", z.object({ userId: IdSchema, from: RoleSchema, to: RoleSchema }));
export const UserDeactivated = envelope("user.deactivated", z.object({ userId: IdSchema }));
export const UserTwoFactorReset = envelope("user.twoFactorReset", z.object({ userId: IdSchema }));

export const DomainEventSchema = z.discriminatedUnion("name", [
  LeadCreated, LeadStatusChanged, LeadAssigned, LeadScored, LeadNeedsAttention, SignalRecorded, SourcingRunCompleted,
  ComplianceVerdictChanged, ComplianceSuppressed, ComplianceDsrCompleted,
  AuditCompleted, FindingDismissed, ProfilePublished, CrossSellDetected, CapacityModeChanged,
  MessageDrafted, MessageApproved, OutreachEnrolled, OutreachStepSent, OutreachEnrollmentStopped, OutreachBounceRecorded, MailboxPaused,
  ReplyReceived, ReplyClassified, MeetingBooked, MeetingUpdated, ProposalSent, DealWon, DealLost, HandoffCreated,
  SettingsChanged, JobFailed, IntegrationFailing, AiBudgetWarning, AiBudgetExceeded,
  UserInvited, UserRoleChanged, UserDeactivated, UserTwoFactorReset,
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type DomainEventName = DomainEvent["name"];
export type EventOf<N extends DomainEventName> = Extract<DomainEvent, { name: N }>;
/** What publishers pass: the platform fills id and occurredAt. */
// Distributive, so a name can only carry its own payload (Omit over the whole union would accept any mix).
export type NewEvent<N extends DomainEventName = DomainEventName> = N extends DomainEventName ? Omit<EventOf<N>, "id" | "occurredAt"> : never;

// ---- Publishing (Phase 6) ----
/** Publish now (outside a transaction). Inline subscribers run before it resolves; job subscribers are enqueued. */
export type Publish = <N extends DomainEventName>(event: NewEvent<N>) => Promise<{ eventId: string }>;
/** Inside a transaction: writes a DomainEvent outbox row with tx; delivered only after commit. A rollback emits nothing. */
export type PublishAfterCommit = <N extends DomainEventName>(tx: unknown /* Tx from @/platform/db */, event: NewEvent<N>) => Promise<{ eventId: string }>;

// ---- Subscribing ----
export interface SubscriberDefinition<N extends DomainEventName = DomainEventName> {
  id: string;                                  // unique, e.g. "acquisition.scoring.rescore-on-audit"
  events: readonly N[];
  mode: "inline" | "job";                      // inline: fast, same request, errors logged; job: enqueued via platform.deliver-event
  handler: (event: EventOf<N>, ctx: { clock: { now(): Date } }) => Promise<void>;
  systemActions?: readonly string[];           // PermissionActions its services perform as the SYSTEM actor (permissions.md rule 10)
}
/** Type-erased subscriber, as manifests list them. Produced by defineSubscriber() (Phase 2 registry), which checks the event's name before calling the typed handler. */
export type AnySubscriberDefinition = SubscriberDefinition;
export type DefineSubscriber = <N extends DomainEventName>(def: SubscriberDefinition<N>) => AnySubscriberDefinition;

// ---- Notification payload data (stored in Notification.data) ----
export const NotificationDataSchema = z.object({
  entity: z.object({ type: z.string(), id: IdSchema }).optional(),   // e.g. { type: "acquisition.lead", id }
  serviceLine: ServiceLineSchema.optional(),
  eventId: IdSchema.optional(),
  values: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).default({}),
});
export type NotificationData = z.infer<typeof NotificationDataSchema>;
```

## 3. Event catalogue (emitter and main subscribers)

| Event | Emitted by | Main subscribers |
|---|---|---|
| `lead.created` | Phase 8 (runner, CSV import, manual add) | 19 `acquisition.lead.advance` (starts the workflow), 17 cache |
| `lead.statusChanged` | the caller of `transitionLead()` (any acquisition phase), after commit | 17 cache, 6 audit-bridge (not audited elsewhere), 19 orchestration |
| `lead.assigned` | 11 / 16-called services (`assignLead`, inbox `assignThread`) | notification-router |
| `lead.scored` | 11 | 11 cross-sell detection, 12 (first-touch draft via 19), 17 cache |
| `lead.needsAttention` | 19 sweeper | notification-router → `lead.needs-attention` |
| `signal.recorded` | 8 | 11 re-score (not yet contacted) |
| `sourcing.run.completed` | 8 | notification-router → `sourcing.run-completed` |
| `compliance.verdict.changed` | 9 | 11 re-score |
| `compliance.suppressed` | 9 | 12 (defensive stop check), 17 cache |
| `compliance.dsr.completed` | 9 | notification-router (requester admin) |
| `audit.completed` | 10 | 11 scoring (via 19 advance), 11 re-score |
| `finding.dismissed` | 10 | 12 (invalidates pending approvals that cite it), 11 brief regeneration |
| `profile.published` | 7 | 12 (sequence materialisation for the new version), 17 cache |
| `crosssell.detected` | 11 | notification-router → `crosssell.detected` |
| `capacity.mode.changed` | 11 | notification-router → `capacity.line-full` (entering `SLOW` or `PAUSED`); `capacity.line-released` comes from the release job |
| `message.drafted` | 12 | notification-router (digest `review.queue-waiting`) |
| `message.approved` | 12 | 17 cache |
| `outreach.enrolled`, `outreach.step.sent`, `outreach.enrollment.stopped` | 12 | 17 cache, 13 SLA context |
| `outreach.bounce.recorded`, `mailbox.paused` | 12 | notification-router → `mailbox.paused` |
| `reply.received`, `reply.classified` | 13 | notification-router → `reply.interested` / `reply.needs-action`, 17 cache |
| `meeting.booked`, `meeting.updated` | 14 | notification-router → `meeting.booked`; 14 pre-call job scheduling |
| `proposal.sent` | 14 | 17 cache |
| `deal.won`, `deal.lost` | 14 | notification-router → `deal.won` / `deal.lost`; 11 throttle re-evaluation; future Projects module |
| `handoff.created` | 14 | notification-router → `handoff.assigned` |
| `settings.changed` | 6 | per-request settings cache invalidation. A Phase 9 subscriber (job mode) handles key `acquisition.compliance.ngDirectMarketingBasis`: it enqueues `acquisition.compliance.reevaluate`, which re-evaluates open Nigerian leads and emits `compliance.verdict.changed` per changed lead |
| `job.failed`, `integration.failing` | 6 | notification-router → admins |
| `ai.budget.warning`, `ai.budget.exceeded` | 5 | notification-router → admins (`ai.budget-warning`, `ai.budget-exceeded`) |
| `user.invited`, `user.roleChanged`, `user.deactivated`, `user.twoFactorReset` | 3 | notification-router → `security.role-changed`, `security.2fa-reset` |

## 3a. Notification-type registry (the single list)

Every notification type the platform sends. Each row is registered as a `NotificationTypeDefinition` (`docs/contracts/module-manifest.md`):
- **Platform types:** Phase 6 seeds them in the core manifest.
- **Module types:** exported from the owning area's `notifications.ts` and added to the acquisition manifest at integration.

**Column meanings:**
- **Category:** `transactional` types are security and account notices. `product` types are operational work notices.
- **Default channels:** users can change them in `/settings` unless the type is **critical**. Critical types can't be muted (saas-notify).
- **Digestible:** the type may be batched into the daily digest (`platform.notifications-digest`).

**Recipients** are resolved by the sender, with the lead owner as the default:
- `owner`: the lead owner, falling back to the line owners when unassigned
- `line owners`: the `SERVICE_LEAD`s of the line
- `managers`, `admins`: by role
- `assignee`: the handoff assignee
- `actor`: the user who started the work

| Type | Label | Category | Default channels | Critical | Digestible | Recipients | Emitted by (phase) | Trigger |
|---|---|---|---|---|---|---|---|---|
| `review.queue-waiting` | Drafts waiting for review | product | in-app | no | yes | line owners, owners with `canApprove` | 12 (via 6 router) | `message.drafted` (digest of waiting drafts) |
| `reply.interested` | Interested reply | product | in-app, email | **yes** | no | owner | 13 (router) | `reply.classified` = INTERESTED |
| `reply.needs-action` | Reply needs action | product | in-app, email | no | no | owner | 13 (router) | `reply.classified` = QUESTION, OBJECTION_*, OTHER, or low confidence |
| `meeting.booked` | Meeting booked | product | in-app, email | no | no | owner | 14 (router) | `meeting.booked` |
| `meeting.reminder` | Meeting reminder | product | in-app, email | no | no | owner | 14 | job `acquisition.pipeline.meeting-reminders` (24 h and 1 h before) |
| `deal.won` | Deal won | product | in-app, email | no | no | owner, line owners, managers | 14 (router) | `deal.won` |
| `deal.lost` | Deal lost | product | in-app | no | yes | owner, line owners | 14 (router) | `deal.lost` |
| `capacity.line-full` | Line at capacity | product | in-app, email | no | no | line owners, managers | 11 (router) / 8 | `capacity.mode.changed` to SLOW or PAUSED; a saved search skipped for capacity (at most once a day) |
| `job.failed` | Background job failed | product | in-app, email | no | no | admins | 6 (router) | `job.failed` |
| `integration.failing` | Integration failing | product | in-app, email | no | no | admins | 6 (router) | `integration.failing` (job `platform.credentials-health`) |
| `ai.budget-warning` | AI budget at 80% | product | in-app, email | no | no | admins | 5 (router) | `ai.budget.warning` |
| `ai.budget-exceeded` | AI budget reached | product | in-app, email | **yes** | no | admins | 5 (router) | `ai.budget.exceeded` |
| `security.role-changed` | Your role changed | transactional | in-app, email | **yes** | no | the affected user | 3 (router) | `user.roleChanged` |
| `security.2fa-reset` | Your two-factor authentication was reset | transactional | in-app, email | **yes** | no | the affected user | 3 (router) | `user.twoFactorReset` |
| `sourcing.run-completed` | Search finished | product | in-app | no | yes | actor (or the saved search owner) | 8 (router) | `sourcing.run.completed` |
| `crosssell.detected` | Cross-sell opportunity | product | in-app | no | yes | line owners of every line in the group | 11 (router) | `crosssell.detected` |
| `capacity.line-released` | Line capacity freed | product | in-app | no | yes | line owners | 11 | job `acquisition.capacity.release` |
| `mailbox.paused` | Outreach mailbox paused | product | in-app, email | **yes** | no | admins, managers | 12 (router) | `mailbox.paused` |
| `reply.sla-warning` | Reply SLA at 75% | product | in-app | no | no | owner | 13 | job `acquisition.inbox.sla-check` |
| `reply.sla-breached` | Reply SLA breached | product | in-app, email | **yes** | no | owner, managers | 13 | job `acquisition.inbox.sla-check` |
| `nurture.follow-up-due` | Follow-up due | product | in-app | no | yes | owner | 13 | job `acquisition.inbox.nurture-reminders` |
| `precall.ready` | Pre-call brief ready | product | in-app, email | no | no | owner | 14 | job `acquisition.pipeline.precall-brief` |
| `proposal.approval-needed` | Proposal needs approval | product | in-app, email | no | no | managers (exception) or owner | 14 | proposal created above the discount threshold or outside the range |
| `proposal.expired` | Proposal expired | product | in-app | no | yes | owner | 14 | job `acquisition.pipeline.proposal-expiry` |
| `handoff.assigned` | Handoff assigned to you | product | in-app, email | no | no | assignee | 14 (router) | `handoff.created`, or a manual `assignHandoff` |
| `lead.stale` | Lead has gone stale | product | in-app | no | yes | owner | 14 | job `acquisition.pipeline.stale-check` |
| `lead.needs-attention` | Lead stuck in the pipeline | product | in-app | no | no | line owners, admins | 19 (router) | `lead.needsAttention` (sweeper restarts exhausted) |
| `analytics.weekly-report` | Weekly acquisition report | product | email | no | no | managers, admins | 17 | job `acquisition.analytics.weekly-report` (Mondays 08:00 Africa/Lagos) |
| `lead.assigned` | Lead assigned to you | product | in-app | no | yes | new owner | 11 / 13 (router) | `lead.assigned` |
| `compliance.dsr-completed` | Data request completed | transactional | in-app, email | no | no | the admin who created the request | 9 (router) | `compliance.dsr.completed` |
| `note.mentioned` | You were mentioned in a note | product | in-app | no | yes | mentioned users | 14 | note saved with mentions |
| `lead.reengage-due` | Lost lead back in nurture | product | in-app | no | yes | owner | 14 | job `acquisition.pipeline.reengage` (`LOST → NURTURE`) |

Adding a type means adding a row here, in the same change as the owning phase's `notifications.ts` export (through `REQUESTS.md`).

## 4. Rules

1. **After commit.** An event that describes a database change is published with `publishAfterCommit(tx, …)` inside the same transaction. A rolled-back transaction emits nothing. `transitionLead(tx, …)` returns `{ lead, event }` (the updated lead and its `LeadEvent` row), and its caller publishes `lead.statusChanged` this way.
2. **At-least-once delivery.** Job-mode subscribers may see an event twice, so every handler is idempotent, keyed on `event.id` or on the entity's current state.
3. **Isolation.** One failing subscriber never fails the publisher or the other subscribers. Inline errors are logged. Job-mode failures retry and then surface as `job.failed`.
4. **No personal data in payloads** beyond IDs. Emails appear only as SHA-256 hashes (INV-13, saas-ship logging rules).
5. **Payload schemas change additively only.** A field is never renamed or removed, and a breaking change is a new event name.
6. **Subscribers are declared** in a module manifest (`subscribers`) or in a `subscribers.ts` file that the registry codegen discovers. Phase 6 picks one mechanism and records it in `src/platform/events/README.md`. Either way, `getAllSubscribers()` lists them all.
7. **Notifications** are driven by the Phase 6 `notification-router` subscriber, which maps events to the notification types in §3a and calls `notify()`. Modules may call `notify()` directly for notifications that no event describes, such as reminders fired by jobs.
8. **Analytics** (Phase 17) never depends on events for correctness. It queries the tables and uses events only to invalidate cached results (cache tags).
9. **Envelope validation.** `publish` validates the envelope with `DomainEventSchema`. An invalid event throws `VALIDATION_FAILED` in development and test, and is logged and dropped in production.

## 5. Worked example

```ts
await publishAfterCommit(tx, {
  name: "deal.won",
  actor: { type: "USER", userId: "cm1owner000000000000000001", role: "SERVICE_LEAD" },
  payload: {
    dealId: "cm1deal0000000000000000001", leadId: "cm1lead0000000000000000042", companyId: "cm1comp0000000000000000007",
    serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", valueMinor: 180_000_000, currency: "NGN", services: ["WEB_DEVELOPMENT"],
  },
});
// Subscribers: notification-router (deal.won to owner, line lead, managers), throttle re-evaluation, analytics cache tag.
```

## 6. Invalid example (Phase 2 test)

```ts
DomainEventSchema.safeParse({
  id: "cm1evt00000000000000000001", name: "deal.won", occurredAt: "2026-10-03T10:00:00Z",
  actor: { type: "SYSTEM", job: "acquisition.pipeline" },
  payload: { dealId: "cm1deal0000000000000000001", leadId: "cm1lead0000000000000000042", companyId: "cm1comp0000000000000000007",
             serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", valueMinor: 1800000.5, currency: "NGN", services: [] },
});
// → fails: ["payload","valueMinor"] expected int; ["payload","services"] too small (min 1)
```
