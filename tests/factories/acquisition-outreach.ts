/**
 * Factories for outreach: sequences, enrolments, messages, citations, attachments, sending
 * domains, mailboxes and their stats, sync state and tracking events.
 */

import type {
  Enrollment,
  Mailbox,
  MailboxDailyStat,
  MailboxSyncState,
  Message,
  MessageAttachment,
  MessageCitation,
  Prisma,
  SendingDomain,
  Sequence,
  SequenceStep,
  TrackingEvent,
  Tx,
} from "@/platform/db";

import { createLead, createProfileVersion, createSignal } from "./acquisition-leads";
import { createFileObject } from "./core";
import { createContact } from "./directory";
import { FIXED_NOW, daysAgo, seq, uniqueDomain, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

// ---- Sequences ------------------------------------------------------------------------------------

export function buildSequence(
  overrides: Input<Prisma.SequenceUncheckedCreateInput> & { profileVersionId: string },
): Prisma.SequenceUncheckedCreateInput {
  return {
    serviceLine: "WEB_DEVELOPMENT",
    market: "NIGERIA",
    sequenceKey: `test_sequence_${String(seq())}`,
    name: "WhatsApp first",
    ...overrides,
  };
}
export async function createSequence(
  tx: Tx,
  overrides: Input<Prisma.SequenceUncheckedCreateInput> = {},
): Promise<Sequence> {
  const profileVersionId =
    overrides.profileVersionId ??
    (await createProfileVersion(tx, { serviceLine: overrides.serviceLine ?? "WEB_DEVELOPMENT" }))
      .id;
  return tx.sequence.create({ data: buildSequence({ ...overrides, profileVersionId }) });
}

export function buildSequenceStep(
  overrides: Input<Prisma.SequenceStepUncheckedCreateInput> & { sequenceId: string },
): Prisma.SequenceStepUncheckedCreateInput {
  return {
    stepIndex: 0,
    channel: "EMAIL",
    delayBusinessDays: 0,
    purpose: "INTRO_AUDIT_INSIGHT",
    stopConditions: [
      "ANY_REPLY",
      "BOUNCE",
      "UNSUBSCRIBE",
      "MEETING_BOOKED",
      "SUPPRESSED",
      "LEAD_INACTIVE",
    ],
    ...overrides,
  };
}
export async function createSequenceStep(
  tx: Tx,
  overrides: Input<Prisma.SequenceStepUncheckedCreateInput> = {},
): Promise<SequenceStep> {
  const sequenceId = overrides.sequenceId ?? (await createSequence(tx)).id;
  return tx.sequenceStep.create({ data: buildSequenceStep({ ...overrides, sequenceId }) });
}

// ---- Sending domains and mailboxes --------------------------------------------------------------

export function buildSendingDomain(
  overrides: Input<Prisma.SendingDomainUncheckedCreateInput> = {},
): Prisma.SendingDomainUncheckedCreateInput {
  return {
    domain: uniqueDomain("outreach"),
    provider: "mock",
    spfStatus: "PASS",
    dkimStatus: "PASS",
    dmarcStatus: "PASS",
    mxStatus: "PASS",
    ...overrides,
  };
}
export function createSendingDomain(
  tx: Tx,
  overrides: Input<Prisma.SendingDomainUncheckedCreateInput> = {},
): Promise<SendingDomain> {
  return tx.sendingDomain.create({ data: buildSendingDomain(overrides) });
}

/** An ACTIVE mock mailbox; its credential key follows "outreach-mailbox:<mailboxId>". */
export function buildMailbox(
  overrides: Input<Prisma.MailboxUncheckedCreateInput> & { sendingDomainId: string },
): Prisma.MailboxUncheckedCreateInput {
  const id =
    overrides.id ?? `cmbx${uniqueToken().replace(/[^a-z0-9]/g, "")}${"0".repeat(10)}`.slice(0, 25);
  return {
    id,
    address: `sender.${uniqueToken()}@outreach.example`,
    displayName: "Tolu Adeyemi at FUTUREUNI",
    provider: "mock",
    credentialProvider: `outreach-mailbox:${id}`,
    status: "ACTIVE",
    warmupStartDate: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}
export async function createMailbox(
  tx: Tx,
  overrides: Input<Prisma.MailboxUncheckedCreateInput> = {},
): Promise<Mailbox> {
  const sendingDomainId = overrides.sendingDomainId ?? (await createSendingDomain(tx)).id;
  return tx.mailbox.create({ data: buildMailbox({ ...overrides, sendingDomainId }) });
}

export function buildMailboxDailyStat(
  overrides: Input<Prisma.MailboxDailyStatUncheckedCreateInput> & { mailboxId: string },
): Prisma.MailboxDailyStatUncheckedCreateInput {
  return {
    day: new Date("2026-10-02T00:00:00.000Z"),
    sent: 30,
    bouncesHard: 0,
    bouncesSoft: 1,
    replies: 2,
    ...overrides,
  };
}
export async function createMailboxDailyStat(
  tx: Tx,
  overrides: Input<Prisma.MailboxDailyStatUncheckedCreateInput> = {},
): Promise<MailboxDailyStat> {
  const mailboxId = overrides.mailboxId ?? (await createMailbox(tx)).id;
  return tx.mailboxDailyStat.create({ data: buildMailboxDailyStat({ ...overrides, mailboxId }) });
}

export async function createMailboxSyncState(
  tx: Tx,
  overrides: Input<Prisma.MailboxSyncStateUncheckedCreateInput> = {},
): Promise<MailboxSyncState> {
  const mailboxId = overrides.mailboxId ?? (await createMailbox(tx)).id;
  return tx.mailboxSyncState.create({
    data: { cursor: "1000", lastPolledAt: daysAgo(0), ...overrides, mailboxId },
  });
}

// ---- Enrolments and messages ------------------------------------------------------------------------

/**
 * An ACTIVE enrolment. INV-9: one ACTIVE or PAUSED enrolment per company, so it creates its own
 * lead (and company) unless one is given.
 */
export async function createEnrollment(
  tx: Tx,
  overrides: Input<Prisma.EnrollmentUncheckedCreateInput> = {},
): Promise<Enrollment> {
  const lead =
    overrides.leadId === undefined
      ? await createLead(tx, { status: "CONTACTED" })
      : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  const contactId =
    overrides.contactId ?? (await createContact(tx, { companyId: lead.companyId })).id;
  const sequenceId =
    overrides.sequenceId ??
    (await createSequence(tx, { serviceLine: lead.serviceLine, market: lead.market })).id;
  return tx.enrollment.create({
    data: {
      status: "ACTIVE",
      currentStepIndex: 0,
      nextRunAt: FIXED_NOW,
      ...overrides,
      leadId: lead.id,
      companyId: overrides.companyId ?? lead.companyId,
      contactId,
      sequenceId,
    },
  });
}

export function buildMessage(
  overrides: Input<Prisma.MessageUncheckedCreateInput> & { leadId: string; companyId: string },
): Prisma.MessageUncheckedCreateInput {
  return {
    kind: "SEQUENCE",
    channel: "EMAIL",
    status: "DRAFT",
    stepIndex: 0,
    subject: "Your homepage on mobile",
    body: "Hi, your homepage took 7.2s to show its main content on mobile in our test.",
    ...overrides,
  };
}
/** A DRAFT email on its own lead, to the lead's company contact. */
export async function createMessage(
  tx: Tx,
  overrides: Input<Prisma.MessageUncheckedCreateInput> = {},
): Promise<Message> {
  const lead =
    overrides.leadId === undefined
      ? await createLead(tx, { status: "IN_REVIEW" })
      : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  const contactId =
    overrides.contactId === undefined
      ? (await createContact(tx, { companyId: lead.companyId })).id
      : overrides.contactId;
  return tx.message.create({
    data: buildMessage({
      ...overrides,
      leadId: lead.id,
      companyId: overrides.companyId ?? lead.companyId,
      contactId,
    }),
  });
}

/** A citation of a signal (pass findingId instead to cite a finding; exactly one, INV-5). */
export async function createMessageCitation(
  tx: Tx,
  overrides: Input<Prisma.MessageCitationUncheckedCreateInput> = {},
): Promise<MessageCitation> {
  const message =
    overrides.messageId === undefined
      ? await createMessage(tx)
      : await tx.message.findUniqueOrThrow({ where: { id: overrides.messageId } });
  const cited =
    overrides.findingId !== undefined || overrides.signalId !== undefined
      ? {}
      : {
          signalId: (
            await createSignal(tx, { companyId: message.companyId, leadId: message.leadId })
          ).id,
        };
  return tx.messageCitation.create({ data: { ...cited, ...overrides, messageId: message.id } });
}

export async function createMessageAttachment(
  tx: Tx,
  overrides: Input<Prisma.MessageAttachmentUncheckedCreateInput> = {},
): Promise<MessageAttachment> {
  const messageId = overrides.messageId ?? (await createMessage(tx)).id;
  const fileObjectId =
    overrides.fileObjectId ??
    (
      await createFileObject(tx, {
        purpose: "PROPOSAL_PDF",
        contentType: "application/pdf",
        key: `test/${uniqueToken()}.pdf`,
      })
    ).id;
  return tx.messageAttachment.create({
    data: { filename: "FUTUREUNI proposal.pdf", ...overrides, messageId, fileObjectId },
  });
}

export async function createTrackingEvent(
  tx: Tx,
  overrides: Input<Prisma.TrackingEventUncheckedCreateInput> = {},
): Promise<TrackingEvent> {
  const messageId =
    overrides.messageId === undefined
      ? (
          await createMessage(tx, {
            status: "SENT",
            sentAt: FIXED_NOW,
            providerMessageId: `mock-${uniqueToken()}`,
            footerSnapshot: "--\nFUTUREUNI\n[TEST] 1 Example Street",
          })
        ).id
      : overrides.messageId;
  return tx.trackingEvent.create({
    data: {
      type: "DELIVERED",
      provider: "mock",
      providerEventId: `evt-${uniqueToken()}`,
      occurredAt: FIXED_NOW,
      ...overrides,
      messageId,
    },
  });
}
