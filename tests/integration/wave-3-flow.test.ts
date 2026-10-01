/**
 * Wave 3 / batch B4 integration flow (phases 11, 12 and 14). One non-reply journey through the three
 * phases against the real, wired seams: an AUDITED lead is scored and briefed (11), drafted, approved
 * and sent as a first touch (12), then booked for a meeting — which stops the sequence through the real
 * `stopEnrollments` seam (12) — and taken to a sent proposal through the real `sendOneOffEmail` seam
 * (12), then won with a handoff (14). The reply-driven branches are Phase 13 (batch B5) and are not
 * exercised here.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor, Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { registerTask } from "@/platform/ai";
import { actorOf } from "@/platform/auth";
import { db, toJsonInput } from "@/platform/db";
import { getPricingForLine } from "@/modules/acquisition/profiles";
import { server } from "@/tests/setup/msw-server";
import {
  buildValidProfile,
  createAuditFinding,
  createCompany,
  createContact,
  createLeadInStatus,
  createMailbox,
  createProfileVersion,
  createSignal,
  createTeamMember,
} from "@/tests/factories";

import { borderlineReviewTask, leadBriefTask, qualifyLead } from "@/modules/acquisition/scoring";
import { approveMessage, createDraft, sendEmailMessage } from "@/modules/acquisition/outreach";
import { createMeeting, createProposal, approveProposal, sendProposal, markWon } from "@/modules/acquisition/pipeline";
import { registerPipelineTasks } from "@/modules/acquisition/pipeline/tasks";

const LINE: ServiceLine = "WEB_DEVELOPMENT";
const SYSTEM: Actor = { type: "SYSTEM", job: "acquisition.scoring.lead" };
const NOTE = "test version (wave-3-flow)";
const WINDOW_NOW = new Date("2026-10-05T11:00:00.000Z"); // weekday midday in London
const clock = { now: () => WINDOW_NOW };

let managerActor: Actor;
let ownerId = "";
const userIds = new Set<string>();
const companyIds = new Set<string>();
const mailboxIds = new Set<string>();
const sendingDomainIds = new Set<string>();
const profileVersionIds = new Set<string>();

/** A signal-driven scoring profile over the real sequences/angles/pricing: sig_a + sig_b = 70 (QUALIFIED). */
function controlledProfile(): ServiceLineProfile {
  const base = buildValidProfile(LINE);
  const sig = (id: string) => ({
    id,
    label: `Signal ${id}`,
    description: "Test scoring signal.",
    weight: 10,
    markets: ["NIGERIA", "INTERNATIONAL"] as Market[],
    evidenceRequired: "test",
    detectingSources: [],
    confirmedBy: [],
    future: false,
  });
  return {
    ...base,
    signals: [...base.signals, sig("sig_a"), sig("sig_b")],
    scoring: {
      rules: [
        { id: "sig_a", label: "Signal A", condition: { all: [{ kind: "signal", signalId: "sig_a", negate: false }] }, points: 40 },
        { id: "sig_b", label: "Signal B", condition: { all: [{ kind: "signal", signalId: "sig_b", negate: false }] }, points: 30 },
      ],
      qualifyThreshold: 61,
      borderlineBand: { min: 40, max: 60 },
      lowScoreAction: "DISQUALIFY",
    },
    disqualifiers: [],
  };
}

beforeAll(async () => {
  // react-pdf fetches an internal wasm via a data: URL during the proposal render; close MSW for this
  // suite (it makes no real HTTP calls in MOCKS mode).
  server.close();
  registerTask(borderlineReviewTask);
  registerTask(leadBriefTask);
  registerPipelineTasks();

  const manager = await createTeamMember(db, { role: "MANAGER", serviceLines: [LINE] });
  userIds.add(manager.user.id);
  managerActor = actorOf({ id: manager.user.id, role: "MANAGER" });
  // A lead owner with capacity on the line, so the throttle is NORMAL and first touches are allowed.
  const owner = await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: [LINE], profile: { weeklyCapacity: 50 } });
  userIds.add(owner.user.id);
  ownerId = owner.user.id;

  await db.serviceLineProfileVersion.updateMany({ where: { serviceLine: LINE, isActive: true }, data: { isActive: false } });
  const version = await createProfileVersion(db, {
    serviceLine: LINE,
    isActive: true,
    status: "PUBLISHED",
    note: NOTE,
    createdById: manager.user.id,
    profile: toJsonInput(controlledProfile()),
  });
  profileVersionIds.add(version.id);

  const postal = toJsonInput("1 Marina Road, Lagos, Nigeria");
  const existing = await db.setting.findFirst({ where: { key: "platform.postalAddress", scope: "PLATFORM" } });
  if (existing === null) await db.setting.create({ data: { key: "platform.postalAddress", scope: "PLATFORM", value: postal } });
  else await db.setting.update({ where: { id: existing.id }, data: { value: postal } });

  const mailbox = await createMailbox(db, {});
  mailboxIds.add(mailbox.id);
  sendingDomainIds.add(mailbox.sendingDomainId);
});

afterAll(async () => {
  const cids = [...companyIds];
  if (cids.length > 0) {
    const proposals = await db.proposal.findMany({
      where: { lead: { companyId: { in: cids } } },
      select: { pdfFileId: true },
    });
    const fileIds = proposals.flatMap((p) => (p.pdfFileId === null ? [] : [p.pdfFileId]));
    await db.handoffAssignment.deleteMany({ where: { handoff: { deal: { companyId: { in: cids } } } } });
    await db.handoff.deleteMany({ where: { deal: { companyId: { in: cids } } } });
    await db.deal.deleteMany({ where: { companyId: { in: cids } } });
    await db.proposalLineItem.deleteMany({ where: { proposal: { lead: { companyId: { in: cids } } } } });
    await db.proposal.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.meeting.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.messageAttachment.deleteMany({ where: { message: { companyId: { in: cids } } } });
    await db.message.deleteMany({ where: { companyId: { in: cids } } });
    await db.enrollment.deleteMany({ where: { companyId: { in: cids } } });
    await db.scoreReview.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.audit.deleteMany({ where: { companyId: { in: cids } } });
    await db.signal.deleteMany({ where: { companyId: { in: cids } } });
    await db.leadEvent.deleteMany({ where: { lead: { companyId: { in: cids } } } });
    await db.lead.deleteMany({ where: { companyId: { in: cids } } });
    if (fileIds.length > 0) await db.fileObject.deleteMany({ where: { id: { in: fileIds } } });
    await db.contact.deleteMany({ where: { companyId: { in: cids } } });
    await db.company.deleteMany({ where: { id: { in: cids } } });
  }
  if (profileVersionIds.size > 0) {
    await db.sequence.deleteMany({ where: { profileVersionId: { in: [...profileVersionIds] } } });
    await db.serviceLineProfileVersion.deleteMany({ where: { id: { in: [...profileVersionIds] } } });
  }
  if (mailboxIds.size > 0) await db.mailbox.deleteMany({ where: { id: { in: [...mailboxIds] } } });
  if (sendingDomainIds.size > 0) await db.sendingDomain.deleteMany({ where: { id: { in: [...sendingDomainIds] } } });
  await db.setting.deleteMany({ where: { key: "platform.postalAddress", scope: "PLATFORM" } });
  if (userIds.size > 0) {
    await db.teamProfile.deleteMany({ where: { userId: { in: [...userIds] } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds] } } });
  }
  server.listen({ onUnhandledRequest: "error" });
});

async function seedAuditedLead(): Promise<{ leadId: string; contactId: string; companyId: string }> {
  const company = await createCompany(db, { country: "GB", legalForm: "LIMITED" });
  companyIds.add(company.id);
  const contact = await createContact(db, { companyId: company.id, emailStatus: "VALID" });
  const lead = await createLeadInStatus(db, "AUDITED", {
    companyId: company.id,
    serviceLine: LINE,
    market: "INTERNATIONAL",
    primaryContactId: contact.id,
    ownerId,
  });
  await createSignal(db, { companyId: company.id, leadId: lead.id, serviceLine: LINE, signalType: "sig_a" });
  await createSignal(db, { companyId: company.id, leadId: lead.id, serviceLine: LINE, signalType: "sig_b" });
  await createAuditFinding(db, { leadId: lead.id, companyId: company.id, pitchable: true });
  return { leadId: lead.id, contactId: contact.id, companyId: company.id };
}

describe("Wave 3 flow (phases 11 → 12 → 14, no reply branch)", () => {
  it("scores, briefs, contacts, books, proposes and wins through the real seams", async () => {
    const { leadId, contactId } = await seedAuditedLead();

    // Phase 11: score + brief.
    const scored = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(scored.status).toBe("SCORED");
    expect(scored.band).toBe("QUALIFIED");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).brief).not.toBeNull();

    // Phase 12: draft (reads the real brief + cross-sell), approve (real throttle), send.
    const draft = await createDraft(managerActor, { leadId, contactId, stepIndex: 0 });
    expect(draft.status).toBe("created");
    if (draft.status !== "created") return;
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("IN_REVIEW");

    await approveMessage(managerActor, draft.messageId, { now: WINDOW_NOW });
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("APPROVED");

    const outcome = await sendEmailMessage(draft.messageId, { now: WINDOW_NOW });
    expect(outcome.status).toBe("sent");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("CONTACTED");

    // Phase 14: a meeting stops the sequence through the real stopEnrollments seam.
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await createMeeting(managerActor, leadId, { startsAt: start, endsAt: end });
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("MEETING_BOOKED");
    const enrolment = await db.enrollment.findFirst({ where: { leadId } });
    expect(enrolment?.status).toBe("STOPPED");

    // Phase 14: a proposal is priced, approved and sent through the real sendOneOffEmail seam.
    const packages = await getPricingForLine(LINE, "INTERNATIONAL");
    const packageId = packages[0]?.id ?? "";
    expect(packageId).not.toBe("");
    const proposal = await createProposal(managerActor, leadId, { packages: [{ packageId }] });
    await approveProposal(managerActor, proposal.proposalId);
    const sent = await sendProposal(managerActor, proposal.proposalId, { contactId, message: "Our proposal is attached." });
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("PROPOSAL_SENT");
    const proposalRow = await db.proposal.findUnique({ where: { id: proposal.proposalId } });
    expect(proposalRow?.pdfFileId).not.toBeNull();
    const oneOff = await db.message.findUnique({ where: { id: sent.messageId } });
    expect(oneOff?.kind).toBe("ONE_OFF");

    // Phase 14: won + handoff.
    const won = await markWon(managerActor, leadId, {
      valueMinor: 500_000,
      currency: "GBP",
      services: [LINE],
      proposalId: proposal.proposalId,
    });
    expect(won.handoffId).toBeTruthy();
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("WON");
  }, 60_000);
});
