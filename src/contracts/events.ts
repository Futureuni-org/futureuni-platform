/**
 * Contract: domain events (docs/contracts/events.md). Implemented by Phase 6 (@/platform/events:
 * publish, publishAfterCommit, subscriber dispatch and the DomainEvent outbox).
 */

import { z } from "zod";

import {
  ActorSchema,
  AuditStatusSchema,
  CapacityModeSchema,
  ChannelSchema,
  ClassificationSourceSchema,
  CostMicrosSchema,
  CurrencySchema,
  DsrTypeSchema,
  EnrollmentStopReasonSchema,
  IdSchema,
  Iso8601Schema,
  LeadStatusSchema,
  LostReasonSchema,
  MarketSchema,
  MeetingStatusSchema,
  MessageStatusSchema,
  MinorUnitsSchema,
  ReplyChannelSchema,
  ReplyClassSchema,
  RoleSchema,
  ScoreBandSchema,
  SearchRunStatusSchema,
  ServiceLineSchema,
  SettingScopeSchema,
  SuppressionTypeSchema,
} from "./common";
import { EmailVerdictSchema } from "./enrichment";
import { SearchRunCountsSchema } from "./source-adapter";

const envelope = <N extends string, P extends z.ZodType>(name: N, payload: P) =>
  z.object({
    id: IdSchema, // unique event id; subscribers dedupe on it
    name: z.literal(name),
    occurredAt: Iso8601Schema,
    actor: ActorSchema,
    payload,
  });

// ---- Lead lifecycle and sourcing ----
export const LeadCreated = envelope(
  "lead.created",
  z.object({
    leadId: IdSchema,
    companyId: IdSchema,
    serviceLine: ServiceLineSchema,
    market: MarketSchema,
    source: z.string().max(80), // adapter id | "manual:<userId>" | "csv-import"
    searchRunId: IdSchema.optional(),
  }),
);
export const LeadStatusChanged = envelope(
  "lead.statusChanged",
  z.object({
    leadId: IdSchema,
    leadEventId: IdSchema,
    from: LeadStatusSchema.nullable(),
    to: LeadStatusSchema,
    serviceLine: ServiceLineSchema,
    market: MarketSchema,
    reason: z.string().max(200).optional(),
  }),
);
export const LeadAssigned = envelope(
  "lead.assigned",
  z.object({ leadId: IdSchema, fromOwnerId: IdSchema.nullable(), toOwnerId: IdSchema }),
);
export const LeadScored = envelope(
  "lead.scored",
  z.object({
    leadId: IdSchema,
    score: z.int().min(0).max(100),
    band: ScoreBandSchema,
    previousScore: z.int().min(0).max(100).nullable(),
    needsHumanReview: z.boolean(),
  }),
);
export const LeadNeedsAttention = envelope(
  "lead.needsAttention",
  z.object({ leadId: IdSchema, reason: z.string().max(200), restarts: z.int().nonnegative() }),
);
export const SignalRecorded = envelope(
  "signal.recorded",
  z.object({
    signalId: IdSchema,
    companyId: IdSchema,
    leadId: IdSchema.nullable(),
    serviceLine: ServiceLineSchema,
    signalType: z.string(),
  }),
);
export const SourcingRunCompleted = envelope(
  "sourcing.run.completed",
  z.object({
    searchRunId: IdSchema,
    serviceLine: ServiceLineSchema,
    status: SearchRunStatusSchema.extract([
      "SUCCEEDED",
      "PARTIAL",
      "FAILED",
      "CANCELLED",
      "SKIPPED",
    ]),
    counts: SearchRunCountsSchema,
  }),
);

// ---- Compliance ----
export const ComplianceVerdictChanged = envelope(
  "compliance.verdict.changed",
  z.object({
    leadId: IdSchema.nullable(),
    companyId: IdSchema,
    contactId: IdSchema.nullable(),
    emailFrom: EmailVerdictSchema.nullable(),
    emailTo: EmailVerdictSchema,
  }),
);
export const ComplianceSuppressed = envelope(
  "compliance.suppressed",
  z.object({
    suppressionId: IdSchema,
    type: SuppressionTypeSchema,
    affectedLeadIds: z.array(IdSchema),
    stoppedEnrollments: z.int().nonnegative(),
  }),
);
export const ComplianceDsrCompleted = envelope(
  "compliance.dsr.completed",
  z.object({ requestId: IdSchema, type: DsrTypeSchema }),
);

// ---- Audits, profiles, scoring, capacity ----
export const AuditCompleted = envelope(
  "audit.completed",
  z.object({
    leadId: IdSchema,
    auditIds: z.array(IdSchema),
    status: AuditStatusSchema.extract(["SUCCEEDED", "PARTIAL", "FAILED", "NOT_APPLICABLE"]),
    findingCount: z.int().nonnegative(),
    pitchableCount: z.int().nonnegative(),
  }),
);
export const FindingDismissed = envelope(
  "finding.dismissed",
  z.object({ findingId: IdSchema, leadId: IdSchema }),
);
export const ProfilePublished = envelope(
  "profile.published",
  z.object({
    serviceLine: ServiceLineSchema,
    version: z.int().positive(),
    previousVersion: z.int().positive().nullable(),
  }),
);
export const CrossSellDetected = envelope(
  "crosssell.detected",
  z.object({
    groupId: IdSchema,
    companyId: IdSchema,
    leadIds: z.array(IdSchema).min(2),
    leadingLeadId: IdSchema,
  }),
);
export const CapacityModeChanged = envelope(
  "capacity.mode.changed",
  z.object({ serviceLine: ServiceLineSchema, from: CapacityModeSchema, to: CapacityModeSchema }),
);

// ---- Outreach ----
export const MessageDrafted = envelope(
  "message.drafted",
  z.object({
    messageId: IdSchema,
    leadId: IdSchema,
    stepIndex: z.int().nonnegative().nullable(),
    status: MessageStatusSchema.extract(["DRAFT", "NEEDS_EDIT"]),
  }),
);
export const MessageApproved = envelope(
  "message.approved",
  z.object({ messageId: IdSchema, leadId: IdSchema, auto: z.boolean() }),
);
export const OutreachEnrolled = envelope(
  "outreach.enrolled",
  z.object({ enrollmentId: IdSchema, leadId: IdSchema, contactId: IdSchema, sequenceId: IdSchema }),
);
export const OutreachStepSent = envelope(
  "outreach.step.sent",
  z.object({
    messageId: IdSchema,
    leadId: IdSchema,
    enrollmentId: IdSchema.nullable(),
    channel: ChannelSchema,
    stepIndex: z.int().nonnegative().nullable(),
  }),
);
export const OutreachEnrollmentStopped = envelope(
  "outreach.enrollment.stopped",
  z.object({
    enrollmentIds: z.array(IdSchema),
    scope: z.object({
      leadId: IdSchema.optional(),
      contactId: IdSchema.optional(),
      companyId: IdSchema.optional(),
    }),
    reason: EnrollmentStopReasonSchema,
  }),
);
export const OutreachBounceRecorded = envelope(
  "outreach.bounce.recorded",
  z.object({
    emailHash: z.string().regex(/^[a-f0-9]{64}$/), // sha256 of the normalised address; never the raw email
    kind: z.enum(["HARD", "SOFT"]),
    messageId: IdSchema.nullable(),
  }),
);
export const MailboxPaused = envelope(
  "mailbox.paused",
  z.object({ mailboxId: IdSchema, reason: z.string().max(200) }),
);

// ---- Inbox and pipeline ----
export const ReplyReceived = envelope(
  "reply.received",
  z.object({
    replyId: IdSchema,
    leadId: IdSchema.nullable(),
    channel: ReplyChannelSchema,
    matched: z.boolean(),
  }),
);
export const ReplyClassified = envelope(
  "reply.classified",
  z.object({
    replyId: IdSchema,
    leadId: IdSchema.nullable(),
    classification: ReplyClassSchema,
    confidence: z.number().min(0).max(1),
    source: ClassificationSourceSchema,
  }),
);
export const MeetingBooked = envelope(
  "meeting.booked",
  z.object({
    meetingId: IdSchema,
    leadId: IdSchema,
    startsAt: Iso8601Schema,
    ownerId: IdSchema.nullable(),
  }),
);
export const MeetingUpdated = envelope(
  "meeting.updated",
  z.object({ meetingId: IdSchema, leadId: IdSchema.nullable(), status: MeetingStatusSchema }),
);
export const ProposalSent = envelope(
  "proposal.sent",
  z.object({
    proposalId: IdSchema,
    leadId: IdSchema,
    totalMinor: MinorUnitsSchema,
    currency: CurrencySchema,
  }),
);
export const DealWon = envelope(
  "deal.won",
  z.object({
    dealId: IdSchema,
    leadId: IdSchema,
    companyId: IdSchema,
    serviceLine: ServiceLineSchema,
    market: MarketSchema,
    valueMinor: MinorUnitsSchema,
    currency: CurrencySchema,
    services: z.array(ServiceLineSchema).min(1),
  }),
);
export const DealLost = envelope(
  "deal.lost",
  z.object({ dealId: IdSchema, leadId: IdSchema, reason: LostReasonSchema }),
);
export const HandoffCreated = envelope(
  "handoff.created",
  z.object({ handoffId: IdSchema, dealId: IdSchema }),
);

// ---- Platform ----
export const SettingsChanged = envelope(
  "settings.changed",
  z.object({ key: z.string(), scope: SettingScopeSchema, userId: IdSchema.nullable() }),
);
export const JobFailed = envelope(
  "job.failed",
  z.object({ jobRunId: IdSchema, name: z.string(), errorSummary: z.string().max(500) }),
);
export const IntegrationFailing = envelope(
  "integration.failing",
  z.object({ provider: z.string(), error: z.string().max(500) }),
);
export const AiBudgetWarning = envelope(
  "ai.budget.warning",
  z.object({
    scope: z.string(), // "platform.daily" | "platform.monthly" | "module:<id>.daily" | "user:<id>.daily"
    usedMicros: CostMicrosSchema,
    limitMicros: CostMicrosSchema,
    percent: z.int().min(0).max(100),
  }),
);
export const AiBudgetExceeded = envelope(
  "ai.budget.exceeded",
  z.object({ scope: z.string(), usedMicros: CostMicrosSchema, limitMicros: CostMicrosSchema }),
);
export const UserInvited = envelope(
  "user.invited",
  z.object({ inviteId: IdSchema, role: RoleSchema, invitedBy: IdSchema }),
);
export const UserRoleChanged = envelope(
  "user.roleChanged",
  z.object({ userId: IdSchema, from: RoleSchema, to: RoleSchema }),
);
export const UserDeactivated = envelope("user.deactivated", z.object({ userId: IdSchema }));
export const UserTwoFactorReset = envelope("user.twoFactorReset", z.object({ userId: IdSchema }));

export const DomainEventSchema = z.discriminatedUnion("name", [
  LeadCreated,
  LeadStatusChanged,
  LeadAssigned,
  LeadScored,
  LeadNeedsAttention,
  SignalRecorded,
  SourcingRunCompleted,
  ComplianceVerdictChanged,
  ComplianceSuppressed,
  ComplianceDsrCompleted,
  AuditCompleted,
  FindingDismissed,
  ProfilePublished,
  CrossSellDetected,
  CapacityModeChanged,
  MessageDrafted,
  MessageApproved,
  OutreachEnrolled,
  OutreachStepSent,
  OutreachEnrollmentStopped,
  OutreachBounceRecorded,
  MailboxPaused,
  ReplyReceived,
  ReplyClassified,
  MeetingBooked,
  MeetingUpdated,
  ProposalSent,
  DealWon,
  DealLost,
  HandoffCreated,
  SettingsChanged,
  JobFailed,
  IntegrationFailing,
  AiBudgetWarning,
  AiBudgetExceeded,
  UserInvited,
  UserRoleChanged,
  UserDeactivated,
  UserTwoFactorReset,
]);
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export type DomainEventName = DomainEvent["name"];
export type EventOf<N extends DomainEventName> = Extract<DomainEvent, { name: N }>;
/**
 * What publishers pass: the platform fills id and occurredAt. Distributive, so a name can only
 * be paired with its own payload (`Omit` over the whole union would accept any mix).
 */
export type NewEvent<N extends DomainEventName = DomainEventName> = N extends DomainEventName
  ? Omit<EventOf<N>, "id" | "occurredAt">
  : never;

// ---- Publishing (Phase 6) ----
/** Publish now (outside a transaction). Inline subscribers run before it resolves; job subscribers are enqueued. */
export type Publish = <N extends DomainEventName>(
  event: NewEvent<N>,
) => Promise<{ eventId: string }>;
/** Inside a transaction: writes a DomainEvent outbox row with tx; delivered only after commit. A rollback emits nothing. */
export type PublishAfterCommit = <N extends DomainEventName>(
  tx: unknown /* Tx from @/platform/db */,
  event: NewEvent<N>,
) => Promise<{ eventId: string }>;

// ---- Subscribing ----
export interface SubscriberDefinition<N extends DomainEventName = DomainEventName> {
  id: string; // unique, e.g. "acquisition.scoring.rescore-on-audit"
  events: readonly N[];
  mode: "inline" | "job"; // inline: fast, same request, errors logged; job: enqueued via platform.deliver-event
  handler: (event: EventOf<N>, ctx: { clock: { now(): Date } }) => Promise<void>;
  systemActions?: readonly string[]; // PermissionActions its services perform as the SYSTEM actor (permissions.md rule 10)
}

/**
 * Type-erased subscriber, as manifests list them. Produced by defineSubscriber() (Phase 2 registry),
 * which checks the event's name before calling the typed handler, so the widening is type-safe.
 */
export type AnySubscriberDefinition = SubscriberDefinition;
export type DefineSubscriber = <N extends DomainEventName>(
  def: SubscriberDefinition<N>,
) => AnySubscriberDefinition;

// ---- Notification payload data (stored in Notification.data) ----
export const NotificationDataSchema = z.object({
  entity: z.object({ type: z.string(), id: IdSchema }).optional(), // e.g. { type: "acquisition.lead", id }
  serviceLine: ServiceLineSchema.optional(),
  eventId: IdSchema.optional(),
  values: z
    .record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .default({}),
});
export type NotificationData = z.infer<typeof NotificationDataSchema>;
