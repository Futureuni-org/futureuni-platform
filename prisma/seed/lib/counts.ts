/**
 * Row counts for every model, printed at the end of a seed run (data-model §10.1). Typed by
 * Prisma.ModelName, so adding a model without a counter here fails to compile.
 */

import type { Prisma } from "@/platform/db";

/** Any client with a `count()` per model: the scoped `db` or the unscoped `dbIncludingDeleted`. */
export type CountingClient = Record<
  Uncapitalize<Prisma.ModelName>,
  { count: () => PromiseLike<number> }
>;
type Counter = (client: CountingClient) => PromiseLike<number>;

export const MODEL_COUNTERS: Record<Prisma.ModelName, Counter> = {
  User: (client) => client.user.count(),
  Session: (client) => client.session.count(),
  Account: (client) => client.account.count(),
  Verification: (client) => client.verification.count(),
  TwoFactor: (client) => client.twoFactor.count(),
  RateLimit: (client) => client.rateLimit.count(),
  Invite: (client) => client.invite.count(),
  TeamProfile: (client) => client.teamProfile.count(),
  Company: (client) => client.company.count(),
  CompanySourceRef: (client) => client.companySourceRef.count(),
  Contact: (client) => client.contact.count(),
  Note: (client) => client.note.count(),
  AuditLog: (client) => client.auditLog.count(),
  Notification: (client) => client.notification.count(),
  NotificationPreference: (client) => client.notificationPreference.count(),
  EmailDelivery: (client) => client.emailDelivery.count(),
  Setting: (client) => client.setting.count(),
  IntegrationCredential: (client) => client.integrationCredential.count(),
  AiCall: (client) => client.aiCall.count(),
  PromptVersion: (client) => client.promptVersion.count(),
  JobRun: (client) => client.jobRun.count(),
  DomainEvent: (client) => client.domainEvent.count(),
  WebhookEvent: (client) => client.webhookEvent.count(),
  IdempotencyKey: (client) => client.idempotencyKey.count(),
  ProviderUsage: (client) => client.providerUsage.count(),
  FileObject: (client) => client.fileObject.count(),
  SavedView: (client) => client.savedView.count(),
  ServiceLineProfileVersion: (client) => client.serviceLineProfileVersion.count(),
  SavedSearch: (client) => client.savedSearch.count(),
  SearchRun: (client) => client.searchRun.count(),
  Signal: (client) => client.signal.count(),
  Lead: (client) => client.lead.count(),
  LeadEvent: (client) => client.leadEvent.count(),
  Audit: (client) => client.audit.count(),
  AuditCheckRun: (client) => client.auditCheckRun.count(),
  AuditFinding: (client) => client.auditFinding.count(),
  AuditCacheEntry: (client) => client.auditCacheEntry.count(),
  ScoreReview: (client) => client.scoreReview.count(),
  CrossSellGroup: (client) => client.crossSellGroup.count(),
  LineCapacityState: (client) => client.lineCapacityState.count(),
  Sequence: (client) => client.sequence.count(),
  SequenceStep: (client) => client.sequenceStep.count(),
  Enrollment: (client) => client.enrollment.count(),
  Message: (client) => client.message.count(),
  MessageCitation: (client) => client.messageCitation.count(),
  MessageAttachment: (client) => client.messageAttachment.count(),
  SendingDomain: (client) => client.sendingDomain.count(),
  Mailbox: (client) => client.mailbox.count(),
  MailboxDailyStat: (client) => client.mailboxDailyStat.count(),
  MailboxSyncState: (client) => client.mailboxSyncState.count(),
  TrackingEvent: (client) => client.trackingEvent.count(),
  Reply: (client) => client.reply.count(),
  ReplyCorrection: (client) => client.replyCorrection.count(),
  InboxThread: (client) => client.inboxThread.count(),
  Suppression: (client) => client.suppression.count(),
  ConsentRecord: (client) => client.consentRecord.count(),
  DataSubjectRequest: (client) => client.dataSubjectRequest.count(),
  Meeting: (client) => client.meeting.count(),
  Proposal: (client) => client.proposal.count(),
  ProposalLineItem: (client) => client.proposalLineItem.count(),
  Deal: (client) => client.deal.count(),
  Handoff: (client) => client.handoff.count(),
  HandoffAssignment: (client) => client.handoffAssignment.count(),
};

/** Counts every model (soft-deleted rows included when given the unscoped client). */
export async function countRows(client: CountingClient): Promise<[Prisma.ModelName, number][]> {
  const counts: [Prisma.ModelName, number][] = [];
  for (const [model, count] of Object.entries(MODEL_COUNTERS) as [Prisma.ModelName, Counter][]) {
    counts.push([model, await count(client)]);
  }
  return counts;
}
