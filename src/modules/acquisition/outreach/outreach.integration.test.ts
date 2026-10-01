import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { ServiceLine } from "@/contracts/common";
import { actorOf } from "@/platform/auth";
import { db, toJsonInput, withTransaction } from "@/platform/db";
import {
  createCompany,
  createContact,
  createCrossSellGroup,
  createLeadWithAudit,
  createMailbox,
  createProfileVersion,
  createUser,
} from "@/tests/factories";

import {
  approveMessage,
  createDraft,
  editMessage,
  enroll,
  processUnsubscribe,
  runOutreachTick,
  sendEmailMessage,
  signUnsubscribeToken,
} from "./index";
import { getMockSend, resetMockSender } from "./email/sender";

// Track everything this file commits, so afterAll restores the shared test database (a stray ADMIN
// or a leftover active profile would break other integration files — see sourcing's runner test).
const companyIds = new Set<string>();
const mailboxIds = new Set<string>();
const sendingDomainIds = new Set<string>();
const profileVersionIds = new Set<string>();
const userIds = new Set<string>();
const suppressionValues = new Set<string>();

const POSTAL_KEY = "platform.postalAddress";
const WINDOW_NOW = new Date("2026-10-05T11:00:00.000Z"); // weekday midday in London (BST)

let managerActor: ReturnType<typeof actorOf>;

async function mkCompany(): Promise<{ id: string }> {
  const company = await createCompany(db, { country: "GB", legalForm: "LIMITED" });
  companyIds.add(company.id);
  return company;
}

/** Reuse or create the single active profile for a line (INV-16, one active per line). */
async function ensureActiveProfile(line: ServiceLine): Promise<void> {
  const existing = await db.serviceLineProfileVersion.findFirst({ where: { serviceLine: line, isActive: true } });
  if (existing !== null) return;
  const user = await createUser(db, { role: "SERVICE_LEAD" });
  userIds.add(user.id);
  const version = await createProfileVersion(db, { serviceLine: line, isActive: true, createdById: user.id });
  profileVersionIds.add(version.id);
}

async function seedEmailLead(line: ServiceLine = "WEB_DEVELOPMENT") {
  const company = await mkCompany();
  const { lead } = await createLeadWithAudit(db, { status: "SCORED", market: "INTERNATIONAL", serviceLine: line, lead: { companyId: company.id } });
  const contact = await createContact(db, { companyId: company.id, emailStatus: "VALID" });
  await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
  return { company, lead, contact };
}

beforeAll(async () => {
  const manager = await createUser(db, { role: "MANAGER" });
  userIds.add(manager.id);
  managerActor = actorOf(manager);
  await ensureActiveProfile("WEB_DEVELOPMENT");
  await ensureActiveProfile("UI_UX_DESIGN");
  // Setting has a partial unique on (key, scope), so find-then-write rather than upsert.
  const postal = toJsonInput("1 Marina Road, Lagos, Nigeria");
  const existingSetting = await db.setting.findFirst({ where: { key: POSTAL_KEY, scope: "PLATFORM" } });
  if (existingSetting === null) {
    await db.setting.create({ data: { key: POSTAL_KEY, scope: "PLATFORM", value: postal } });
  } else {
    await db.setting.update({ where: { id: existingSetting.id }, data: { value: postal } });
  }
  const mailbox = await createMailbox(db, {});
  mailboxIds.add(mailbox.id);
  sendingDomainIds.add(mailbox.sendingDomainId);
});

beforeEach(() => {
  resetMockSender();
});

afterAll(async () => {
  const cids = [...companyIds];
  if (cids.length > 0) {
    await db.trackingEvent.deleteMany({ where: { OR: [{ mailboxId: { in: [...mailboxIds] } }, { message: { companyId: { in: cids } } }] } });
    await db.message.deleteMany({ where: { companyId: { in: cids } } });
    await db.enrollment.deleteMany({ where: { companyId: { in: cids } } });
    await db.scoreReview.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.audit.deleteMany({ where: { companyId: { in: cids } } });
    await db.signal.deleteMany({ where: { companyId: { in: cids } } });
    await db.crossSellGroup.deleteMany({ where: { companyId: { in: cids } } });
    await db.leadEvent.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.lead.deleteMany({ where: { companyId: { in: cids } } });
    await db.contact.deleteMany({ where: { companyId: { in: cids } } });
    await db.company.deleteMany({ where: { id: { in: cids } } });
  }
  if (profileVersionIds.size > 0) {
    await db.sequence.deleteMany({ where: { profileVersionId: { in: [...profileVersionIds] } } });
    await db.serviceLineProfileVersion.deleteMany({ where: { id: { in: [...profileVersionIds] } } });
  }
  if (mailboxIds.size > 0) await db.mailbox.deleteMany({ where: { id: { in: [...mailboxIds] } } });
  if (sendingDomainIds.size > 0) await db.sendingDomain.deleteMany({ where: { id: { in: [...sendingDomainIds] } } });
  if (suppressionValues.size > 0) await db.suppression.deleteMany({ where: { value: { in: [...suppressionValues] } } });
  await db.setting.deleteMany({ where: { key: POSTAL_KEY, scope: "PLATFORM" } });
  if (userIds.size > 0) {
    await db.teamProfile.deleteMany({ where: { userId: { in: [...userIds] } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds] } } });
  }
});

describe("Phase 12 outreach — first touch", () => {
  it("drafts, approves and sends the first touch, moving the lead to CONTACTED", async () => {
    const { lead, contact } = await seedEmailLead();

    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    expect(draft.messageStatus).toBe("DRAFT");
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("IN_REVIEW");

    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("APPROVED");
    const scheduled = await db.message.findUniqueOrThrow({ where: { id: draft.messageId } });
    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.enrollmentId).not.toBeNull();

    const outcome = await sendEmailMessage(draft.messageId, { now: WINDOW_NOW });
    expect(outcome.status).toBe("sent");
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONTACTED");

    const sent = await db.message.findUniqueOrThrow({ where: { id: draft.messageId } });
    expect(sent.status).toBe("SENT");
    expect(sent.providerMessageId).not.toBeNull();
    expect(sent.footerSnapshot).toContain("Unsubscribe");
    expect(sent.footerSnapshot).toContain("1 Marina Road");

    const mock = getMockSend(draft.messageId);
    expect(mock).toBeDefined();
    expect(mock?.email.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mock?.email.headers["List-Unsubscribe"]).toContain("/u/");
    expect(mock?.email.text).not.toContain("[[f:");
  });

  it("blocks a send to a contact suppressed after approval", async () => {
    const { lead, contact } = await seedEmailLead();
    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    if (draft.status !== "created") throw new Error("draft not created");
    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });

    const fresh = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    const value = (fresh.email ?? "").toLowerCase();
    suppressionValues.add(value);
    await db.suppression.create({ data: { type: "EMAIL", value, reason: "MANUAL", source: "MANUAL" } });

    const outcome = await sendEmailMessage(draft.messageId, { now: WINDOW_NOW });
    expect(outcome.status).toBe("blocked");
    expect((await db.message.findUniqueOrThrow({ where: { id: draft.messageId } })).status).toBe("BLOCKED");
  });

  it("cannot approve human-edited text without a claims confirmation", async () => {
    const { lead, contact } = await seedEmailLead();
    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    if (draft.status !== "created") throw new Error("draft not created");

    await editMessage(managerActor, draft.messageId, { subject: "A quick note", body: "Hi, we help businesses like yours with their website." });
    await expect(approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW, humanConfirmedClaims: true });
    expect((await db.message.findUniqueOrThrow({ where: { id: draft.messageId } })).humanConfirmedClaims).toBe(true);
  });
});

describe("Phase 12 outreach — sequences and unsubscribe", () => {
  it("drafts the next step on the tick after the business-day delay", async () => {
    const { lead, contact } = await seedEmailLead();
    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    if (draft.status !== "created") throw new Error("draft not created");
    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });
    await sendEmailMessage(draft.messageId, { now: WINDOW_NOW });

    const laterNow = new Date(WINDOW_NOW.getTime() + 8 * 86_400_000);
    await runOutreachTick(laterNow);

    const stepOne = await db.message.findFirst({ where: { leadId: lead.id, stepIndex: 1 } });
    expect(stepOne).not.toBeNull();
  });

  it("one-click unsubscribe suppresses, stops and is idempotent", async () => {
    const { lead, contact } = await seedEmailLead();
    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    if (draft.status !== "created") throw new Error("draft not created");
    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });
    await sendEmailMessage(draft.messageId, { now: WINDOW_NOW });

    const sent = await db.message.findUniqueOrThrow({ where: { id: draft.messageId } });
    const freshContact = await db.contact.findUniqueOrThrow({ where: { id: contact.id } });
    suppressionValues.add((freshContact.email ?? "").toLowerCase());
    const company = await db.company.findUniqueOrThrow({ where: { id: lead.companyId } });
    if (company.normalizedDomain !== null) suppressionValues.add(company.normalizedDomain.toLowerCase());

    const token = signUnsubscribeToken({ v: 1, tid: sent.unsubscribeTokenId ?? "", mid: sent.id, cid: contact.id, scope: "COMPANY" });

    const first = await processUnsubscribe(token);
    expect(first.ok).toBe(true);
    const suppression = await db.suppression.findFirst({ where: { type: "EMAIL", value: (freshContact.email ?? "").toLowerCase(), removedAt: null } });
    expect(suppression).not.toBeNull();
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("SUPPRESSED");

    const second = await processUnsubscribe(token);
    expect(second.ok).toBe(true);
    expect(second.alreadyDone).toBe(true);
  });

  it("rejects a second active enrolment at the same company (INV-9)", async () => {
    const { company, lead, contact } = await seedEmailLead("WEB_DEVELOPMENT");
    const draft = await createDraft(managerActor, { leadId: lead.id, contactId: contact.id, stepIndex: 0 });
    if (draft.status !== "created") throw new Error("draft not created");
    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });

    const { lead: lead2 } = await createLeadWithAudit(db, { status: "SCORED", market: "INTERNATIONAL", serviceLine: "UI_UX_DESIGN", lead: { companyId: company.id } });
    const contact2 = await createContact(db, { companyId: company.id, emailStatus: "VALID" });

    const result = await withTransaction((tx) => enroll(tx, lead2.id, contact2.id));
    expect(result.created).toBe(false);

    const active = await db.enrollment.count({ where: { companyId: company.id, status: { in: ["ACTIVE", "PAUSED"] } } });
    expect(active).toBe(1);
  });

  it("does not draft for a held cross-sell lead", async () => {
    const company = await mkCompany();
    const { lead: leading } = await createLeadWithAudit(db, { status: "SCORED", market: "INTERNATIONAL", serviceLine: "WEB_DEVELOPMENT", lead: { companyId: company.id } });
    const { lead: held } = await createLeadWithAudit(db, { status: "SCORED", market: "INTERNATIONAL", serviceLine: "UI_UX_DESIGN", lead: { companyId: company.id } });
    const contact = await createContact(db, { companyId: company.id, emailStatus: "VALID" });
    await db.lead.update({ where: { id: held.id }, data: { primaryContactId: contact.id } });

    const group = await createCrossSellGroup(db, { companyId: company.id, leadingLeadId: leading.id });
    await db.lead.updateMany({ where: { id: { in: [leading.id, held.id] } }, data: { crossSellGroupId: group.id } });
    await db.lead.update({ where: { id: held.id }, data: { heldByCrossSell: true } });

    const result = await createDraft(managerActor, { leadId: held.id, contactId: contact.id, stepIndex: 0 });
    expect(result.status).toBe("skipped");
  });
});
