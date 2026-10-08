import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorOf } from "@/platform/auth";
import { db, type Prisma } from "@/platform/db";
import {
  createContact,
  createEnrollment,
  createLeadInStatus,
  createMailbox,
  createMessage,
  createProfileVersion,
  createTeamMember,
  uniqueEmail,
} from "@/tests/factories";

import { applyReplyActions, type InboxSettingsBundle } from "./actions/actions";
import { processReply, reclassify } from "./actions/process";
import type { ClassifyResult } from "./classify/classify";
import { matchInbound } from "./ingest/ingest";
import { createReply as repoCreateReply, getReplyRow } from "./inbox.repo";
import { linkReply } from "./services";
import { sendReply } from "./draft/draft";
import { ensureInboxTasksRegistered } from "./tasks";

const clock = (iso: string) => ({ now: () => new Date(iso) });
const SYSTEM: Actor = { type: "SYSTEM", job: "acquisition.inbox.process" };
const SETTINGS: InboxSettingsBundle = { slaBusinessHours: 4, defaultNurtureDays: 90, outOfOfficeFallbackDays: 7, unsubscribeScope: "COMPANY" };

let manager: Actor;
let ownerId: string;

// Everything this file commits, so afterAll restores the shared test database. Files run serially
// (vitest.config.ts `fileParallelism: false`), so anything left behind is seen by every later file:
// a suppressed domain blocks its contacts, and a line without an active profile breaks scoring.
const userIds = new Set<string>();
const companyIds = new Set<string>();
const mailboxIds = new Set<string>();
const sendingDomainIds = new Set<string>();
const profileVersionIds = new Set<string>();
const deactivatedProfileVersionIds = new Set<string>();

beforeAll(async () => {
  ensureInboxTasksRegistered();
  // This file needs its own active profile, so switch off whatever is active and put it back in
  // afterAll: the line must keep exactly one active version (INV-16).
  const alreadyActive = await db.serviceLineProfileVersion.findMany({
    where: { serviceLine: "WEB_DEVELOPMENT", isActive: true },
    select: { id: true },
  });
  for (const p of alreadyActive) deactivatedProfileVersionIds.add(p.id);
  await db.serviceLineProfileVersion.updateMany({ where: { serviceLine: "WEB_DEVELOPMENT", isActive: true }, data: { isActive: false } });
  const creator = await createTeamMember(db, { role: "ADMIN", serviceLines: ["WEB_DEVELOPMENT"] });
  userIds.add(creator.user.id);
  const version = await createProfileVersion(db, { serviceLine: "WEB_DEVELOPMENT", isActive: true, status: "PUBLISHED", createdById: creator.user.id });
  profileVersionIds.add(version.id);
  const mgr = await createTeamMember(db, { role: "MANAGER", serviceLines: ["WEB_DEVELOPMENT"] });
  userIds.add(mgr.user.id);
  manager = actorOf({ id: mgr.user.id, role: "MANAGER" });
  const owner = await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"] });
  userIds.add(owner.user.id);
  ownerId = owner.user.id;
});

afterAll(async () => {
  const cids = [...companyIds];
  const mids = [...mailboxIds];
  if (cids.length > 0) {
    // A reply classified UNSUBSCRIBE suppresses the address and (COMPANY scope) its domain (INV-3).
    // Read the addresses before the contacts go, then clear both forms.
    const contacts = await db.contact.findMany({ where: { companyId: { in: cids } }, select: { email: true } });
    const values = new Set<string>();
    for (const { email } of contacts) {
      if (email === null || email === "") continue;
      const address = email.toLowerCase();
      values.add(address);
      values.add(address.slice(address.indexOf("@") + 1));
    }
    const companies = await db.company.findMany({ where: { id: { in: cids } }, select: { normalizedDomain: true } });
    for (const { normalizedDomain } of companies) {
      if (normalizedDomain !== null) values.add(normalizedDomain.toLowerCase());
    }
    if (values.size > 0) await db.suppression.deleteMany({ where: { value: { in: [...values] } } });
  }
  // createEnrollment builds a sequence when none is passed, and createSequence builds a profile
  // version to hold it, so those rows belong to this file too. Collect them before the enrolments go.
  const sequenceIds = new Set<string>();
  if (cids.length > 0) {
    const enrollments = await db.enrollment.findMany({
      where: { companyId: { in: cids } },
      select: { sequenceId: true },
    });
    for (const { sequenceId } of enrollments) sequenceIds.add(sequenceId);
  }
  // Replies first: their corrections cascade, and a correction's actor blocks deleting that user.
  if (cids.length > 0 || mids.length > 0) {
    await db.reply.deleteMany({
      where: { OR: [{ companyId: { in: cids } }, { mailboxId: { in: mids } }] },
    });
  }
  if (cids.length > 0) {
    await db.messageAttachment.deleteMany({ where: { message: { companyId: { in: cids } } } });
    await db.message.deleteMany({ where: { companyId: { in: cids } } });
    await db.enrollment.deleteMany({ where: { companyId: { in: cids } } });
    await db.leadEvent.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.lead.deleteMany({ where: { companyId: { in: cids } } });
    await db.contact.deleteMany({ where: { companyId: { in: cids } } });
    await db.company.deleteMany({ where: { id: { in: cids } } });
  }
  // A sequence restricts deleting its profile version, so the sequence goes first; an active
  // version is never touched, in case a sequence was built on the one this file installed.
  if (sequenceIds.size > 0) {
    const sequences = await db.sequence.findMany({
      where: { id: { in: [...sequenceIds] } },
      select: { profileVersionId: true },
    });
    await db.sequenceStep.deleteMany({ where: { sequenceId: { in: [...sequenceIds] } } });
    await db.sequence.deleteMany({ where: { id: { in: [...sequenceIds] } } });
    const versionIds = sequences.map((s) => s.profileVersionId);
    if (versionIds.length > 0) {
      await db.serviceLineProfileVersion.deleteMany({
        where: { id: { in: versionIds }, isActive: false },
      });
    }
  }
  if (mids.length > 0) await db.mailbox.deleteMany({ where: { id: { in: mids } } });
  if (sendingDomainIds.size > 0) await db.sendingDomain.deleteMany({ where: { id: { in: [...sendingDomainIds] } } });
  if (profileVersionIds.size > 0) {
    await db.sequence.deleteMany({ where: { profileVersionId: { in: [...profileVersionIds] } } });
    await db.serviceLineProfileVersion.deleteMany({ where: { id: { in: [...profileVersionIds] } } });
  }
  // Only once this file's own active version is gone, so the line never has two active at once.
  if (deactivatedProfileVersionIds.size > 0) {
    await db.serviceLineProfileVersion.updateMany({
      where: { id: { in: [...deactivatedProfileVersionIds] } },
      data: { isActive: true },
    });
  }
  if (userIds.size > 0) {
    await db.teamProfile.deleteMany({ where: { userId: { in: [...userIds] } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds] } } });
  }
});

interface Conversation {
  leadId: string;
  companyId: string;
  contactId: string;
  contactEmail: string;
  mailboxId: string;
  messageId: string;
  rfcMessageId: string;
  providerThreadId: string;
  enrollmentId: string;
}

async function seedConversation(status: "CONTACTED" | "REPLIED" = "CONTACTED", market: Market = "NIGERIA"): Promise<Conversation> {
  const serviceLine: ServiceLine = "WEB_DEVELOPMENT";
  const lead = await createLeadInStatus(db, status, { serviceLine, market, ownerId });
  companyIds.add(lead.companyId);
  const email = uniqueEmail("prospect");
  const contact = await createContact(db, { companyId: lead.companyId, email, emailStatus: "VALID" });
  await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
  const mailbox = await createMailbox(db);
  mailboxIds.add(mailbox.id);
  sendingDomainIds.add(mailbox.sendingDomainId);
  const rfcMessageId = `<${Math.random().toString(36).slice(2)}@outreach.example>`;
  const providerThreadId = `thread-${Math.random().toString(36).slice(2)}`;
  const message = await createMessage(db, {
    leadId: lead.id,
    companyId: lead.companyId,
    contactId: contact.id,
    kind: "SEQUENCE",
    status: "SENT",
    mailboxId: mailbox.id,
    providerMessageId: `pm-${Math.random().toString(36).slice(2)}`,
    rfcMessageId,
    providerThreadId,
    sentAt: new Date("2026-10-01T08:00:00Z"),
  });
  const enrollment = await createEnrollment(db, { leadId: lead.id, contactId: contact.id });
  return {
    leadId: lead.id,
    companyId: lead.companyId,
    contactId: contact.id,
    contactEmail: email,
    mailboxId: mailbox.id,
    messageId: message.id,
    rfcMessageId,
    providerThreadId,
    enrollmentId: enrollment.id,
  };
}

async function insertMatchedReply(c: Conversation, overrides: Partial<Prisma.ReplyUncheckedCreateInput> = {}): Promise<string> {
  const row = await db.reply.create({
    data: {
      mailboxId: c.mailboxId,
      leadId: c.leadId,
      contactId: c.contactId,
      companyId: c.companyId,
      messageId: c.messageId,
      channel: "EMAIL",
      providerMessageId: `in-${Math.random().toString(36).slice(2)}`,
      providerThreadId: c.providerThreadId,
      inReplyTo: c.rfcMessageId,
      references: [c.rfcMessageId],
      fromAddress: c.contactEmail,
      toAddress: "sender@outreach.example",
      subject: "Re: Your homepage on mobile",
      receivedAt: new Date("2026-10-05T09:00:00Z"),
      headers: {},
      rawBodySanitized: "Reply body",
      latestText: "Reply body",
      matchMethod: "IN_REPLY_TO",
      ...overrides,
    },
    select: { id: true },
  });
  return row.id;
}

describe("ingestion matching + idempotency", () => {
  it("matches a reply to its lead by In-Reply-To (AC-27.1)", async () => {
    const c = await seedConversation();
    const result = await matchInbound({
      providerMessageId: "x1",
      providerThreadId: "other",
      references: [c.rfcMessageId],
      from: { address: c.contactEmail },
      to: [{ address: "sender@outreach.example" }],
      cc: [],
      subject: "Re: hi",
      date: "2026-10-05T09:00:00Z",
      headers: {},
      textBody: "Thanks",
      attachments: [],
      isDeliveryStatusNotification: false,
    });
    expect(result.method).toBe("IN_REPLY_TO");
    expect(result.target?.leadId).toBe(c.leadId);
  });

  it("never stores a duplicate for the same mailbox + provider message id (AC-27.2)", async () => {
    const c = await seedConversation();
    const data = {
      mailboxId: c.mailboxId, leadId: c.leadId, contactId: c.contactId, companyId: c.companyId, messageId: c.messageId,
      channel: "EMAIL" as const, providerMessageId: "dup-1", providerThreadId: null, rfcMessageId: null, inReplyTo: null,
      references: [], fromAddress: c.contactEmail, toAddress: null, subject: null, receivedAt: new Date("2026-10-05T09:00:00Z"),
      headers: null, rawBodySanitized: null, latestText: "hi", attachmentsMeta: null, matchMethod: "IN_REPLY_TO" as const, loggedById: null,
    };
    const first = await repoCreateReply(data);
    const second = await repoCreateReply(data);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });
});

describe("classification actions", () => {
  it("UNSUBSCRIBE: suppresses the email, stops enrolments and moves the lead to SUPPRESSED (INV-3, INV-23)", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, { latestText: "Please unsubscribe me, do not contact me again." });
    await processReply(replyId, clock("2026-10-05T10:00:00Z"));

    const supp = await db.suppression.findFirst({ where: { type: "EMAIL", value: c.contactEmail.toLowerCase() } });
    expect(supp).not.toBeNull();
    expect((await db.enrollment.findUnique({ where: { id: c.enrollmentId } }))?.status).toBe("STOPPED");
    expect((await db.lead.findUnique({ where: { id: c.leadId } }))?.status).toBe("SUPPRESSED");
    expect((await getReplyRow(replyId))?.classification).toBe("UNSUBSCRIBE");
  });

  it("OUT_OF_OFFICE: pauses the enrolment and does not transition the lead (AC-22.3)", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, {
      headers: { "Auto-Submitted": "auto-replied" },
      subject: "Automatic reply: Out of office",
      latestText: "I am away and will be back on October 14.",
    });
    await processReply(replyId, clock("2026-10-05T10:00:00Z"));

    expect((await db.enrollment.findUnique({ where: { id: c.enrollmentId } }))?.status).toBe("PAUSED");
    expect((await db.lead.findUnique({ where: { id: c.leadId } }))?.status).toBe("CONTACTED");
    expect((await getReplyRow(replyId))?.classification).toBe("OUT_OF_OFFICE");
  });

  it("BOUNCE: records the bounce, suppresses the address and marks the contact invalid (INV-2)", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, {
      fromAddress: "mailer-daemon@outreach.example",
      headers: { "Content-Type": "multipart/report; report-type=delivery-status" },
      subject: "Delivery Status Notification (Failure)",
      rawBodySanitized: `Delivery failed.\n\nFinal-Recipient: rfc822; ${c.contactEmail}\nAction: failed\nStatus: 5.1.1`,
      latestText: "Delivery failed.",
    });
    await processReply(replyId, clock("2026-10-05T10:00:00Z"));

    expect(await db.suppression.findFirst({ where: { type: "EMAIL", value: c.contactEmail.toLowerCase() } })).not.toBeNull();
    expect((await db.enrollment.findUnique({ where: { id: c.enrollmentId } }))?.status).toBe("STOPPED");
    expect((await db.contact.findUnique({ where: { id: c.contactId } }))?.emailStatus).toBe("INVALID");
    expect((await getReplyRow(replyId))?.classification).toBe("BOUNCE");
  });

  it("INTERESTED: stops the sequence, moves to REPLIED, starts the SLA and drafts a reply", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, { latestText: "Yes, this sounds useful, can we set up a call next week?" });
    await processReply(replyId, clock("2026-10-05T09:00:00Z"));

    expect((await db.enrollment.findUnique({ where: { id: c.enrollmentId } }))?.status).toBe("STOPPED");
    expect((await db.lead.findUnique({ where: { id: c.leadId } }))?.status).toBe("REPLIED");
    const reply = await getReplyRow(replyId);
    expect(reply?.classification).toBe("INTERESTED");
    expect(reply?.slaStatus).toBe("ON_TRACK");
    expect(reply?.slaDueAt).not.toBeNull();
    const draft = await db.message.findFirst({ where: { inReplyToReplyId: replyId, status: "DRAFT" } });
    expect(draft?.kind).toBe("ONE_OFF");
  });

  it("NOT_NOW: parks the lead in NURTURE with a follow-up date (AC-28.1)", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, { latestText: "Not right now, maybe next quarter." });
    const result = buildResult("NOT_NOW", { followUpDate: "2026-12-01" });
    await applyReplyActions(reader(c, replyId), await leadRow(c.leadId), result, SETTINGS, SYSTEM, clock("2026-10-05T10:00:00Z"), "Africa/Lagos");

    const lead = await db.lead.findUnique({ where: { id: c.leadId } });
    expect(lead?.status).toBe("NURTURE");
    expect(lead?.nurtureReason).toBe("NOT_NOW");
    expect(lead?.nextActionAt).not.toBeNull();
    expect((await db.enrollment.findUnique({ where: { id: c.enrollmentId } }))?.status).toBe("STOPPED");
  });

  it("WRONG_PERSON: creates a verified referral contact (AC-28.1)", async () => {
    const c = await seedConversation();
    const referralEmail = uniqueEmail("referral");
    const replyId = await insertMatchedReply(c, { latestText: `Talk to Sarah, ${referralEmail}` });
    const result = buildResult("WRONG_PERSON", { referral: { name: "Sarah", email: referralEmail, role: "Ops" } });
    await applyReplyActions(reader(c, replyId), await leadRow(c.leadId), result, SETTINGS, SYSTEM, clock("2026-10-05T10:00:00Z"), "Africa/Lagos");

    const contact = await db.contact.findFirst({ where: { companyId: c.companyId, email: referralEmail } });
    expect(contact).not.toBeNull();
    expect((await db.lead.findUnique({ where: { id: c.leadId } }))?.status).toBe("REPLIED");
  });
});

describe("human overrides and linking", () => {
  it("reclassify to UNSUBSCRIBE suppresses immediately and records a correction", async () => {
    const c = await seedConversation();
    const replyId = await insertMatchedReply(c, { latestText: "Actually we are keen.", classification: "INTERESTED", classificationSource: "AI", processedAt: new Date("2026-10-05T09:30:00Z") });
    await reclassify(manager, replyId, "UNSUBSCRIBE", "Customer asked by phone to stop", clock("2026-10-05T10:00:00Z"));

    expect(await db.suppression.findFirst({ where: { type: "EMAIL", value: c.contactEmail.toLowerCase() } })).not.toBeNull();
    expect((await db.lead.findUnique({ where: { id: c.leadId } }))?.status).toBe("SUPPRESSED");
    expect(await db.replyCorrection.findFirst({ where: { replyId, toClass: "UNSUBSCRIBE" } })).not.toBeNull();
  });

  it("links an unmatched reply to a lead and processes it (AC-27.3)", async () => {
    const c = await seedConversation();
    const replyId = await repoCreateReply({
      mailboxId: c.mailboxId, leadId: null, contactId: null, companyId: null, messageId: null, channel: "EMAIL",
      providerMessageId: `un-${Math.random().toString(36).slice(2)}`, providerThreadId: null, rfcMessageId: null, inReplyTo: null,
      references: [], fromAddress: "stranger@elsewhere.example", toAddress: null, subject: "Re: hi", receivedAt: new Date("2026-10-05T09:00:00Z"),
      headers: null, rawBodySanitized: null, latestText: "Yes let's talk", attachmentsMeta: null, matchMethod: "UNMATCHED", loggedById: null,
    }).then((r) => r.id);

    await linkReply(manager, replyId, c.leadId);
    const reply = await getReplyRow(replyId);
    expect(reply?.leadId).toBe(c.leadId);
    expect(reply?.matchMethod).toBe("MANUAL");
  });
});

describe("drafted responses", () => {
  it("sendReply goes through the outreach one-off path and closes the SLA timer", async () => {
    const c = await seedConversation("REPLIED");
    const replyId = await insertMatchedReply(c, { latestText: "What would a basic site cost?", classification: "QUESTION", classificationSource: "AI", slaStatus: "ON_TRACK", slaDueAt: new Date("2026-10-05T13:00:00Z") });

    const { messageId } = await sendReply(manager, replyId, { body: "Thanks for your question — a basic site starts around our smallest package. Happy to walk you through it.", humanConfirmedClaims: true }, clock("2026-10-05T11:00:00Z"));
    const message = await db.message.findUnique({ where: { id: messageId } });
    expect(message?.kind).toBe("ONE_OFF");
    expect(message?.channel).toBe("EMAIL");
    const reply = await getReplyRow(replyId);
    expect(reply?.firstResponseAt).not.toBeNull();
    expect(reply?.slaStatus).toBe("MET");
  });

  it("sendReply refuses without humanConfirmedClaims", async () => {
    const c = await seedConversation("REPLIED");
    const replyId = await insertMatchedReply(c, { latestText: "A question" });
    await expect(sendReply(manager, replyId, { body: "hi", humanConfirmedClaims: false })).rejects.toBeInstanceOf(AppError);
  });
});

describe("permissions", () => {
  it("a member outside the line cannot read the thread", async () => {
    const c = await seedConversation();
    const other = await createTeamMember(db, { role: "MEMBER", serviceLines: ["GRAPHIC_DESIGN"] });
    userIds.add(other.user.id);
    const otherActor = actorOf({ id: other.user.id, role: "MEMBER" });
    const { getThread } = await import("./services");
    await expect(getThread(otherActor, c.leadId)).rejects.toBeInstanceOf(AppError);
  });
});

// ---- helpers ----

function buildResult(classification: ClassifyResult["classification"], over: Partial<ClassifyResult> = {}): ClassifyResult {
  return {
    classification,
    source: "AI",
    confidence: 0.85,
    followUpDate: null,
    referral: null,
    objectionSummary: null,
    questions: [],
    sentiment: "neutral",
    language: "en",
    summary: `${classification} reply`,
    needsHumanReview: false,
    aiCallId: null,
    bounce: null,
    returnDateText: null,
    ...over,
  };
}

function reader(c: Conversation, replyId: string) {
  return { id: replyId, companyId: c.companyId, contactId: c.contactId, messageId: c.messageId, fromAddress: c.contactEmail, subject: "Re: hi", latestText: "Reply body", channel: "EMAIL" as const };
}

async function leadRow(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, select: { id: true, companyId: true, serviceLine: true, market: true, status: true, ownerId: true, primaryContactId: true, country: true, brief: true } });
  return lead;
}
