import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorOf } from "@/platform/auth";
import { db } from "@/platform/db";
import { getPricingForLine } from "@/modules/acquisition/profiles";
import { createContact } from "@/tests/factories";
import { createLeadInStatus, createProfileVersion } from "@/tests/factories";
import { createTeamMember } from "@/tests/factories";
import { server } from "@/tests/setup/msw-server";

import { regeneratePrecallBrief, createMeeting } from "../meetings/meetings";
import { approveProposal, createProposal, sendProposal } from "./proposals";
import { registerPipelineTasks } from "../tasks";

let manager: Actor;
let member: Actor;
let ownerId: string;
let packageId: string;

// The proposal flow renders a PDF (react-pdf fetches an internal wasm via a data: URL), so close
// MSW for this suite; it makes no HTTP calls (MOCKS mode uses AI fixtures and local storage).
beforeAll(async () => {
  server.close();
  registerPipelineTasks();

  // Exactly one active WEB_DEVELOPMENT profile, with pricing for Nigeria.
  await db.serviceLineProfileVersion.updateMany({
    where: { serviceLine: "WEB_DEVELOPMENT", isActive: true },
    data: { isActive: false },
  });
  const creator = await createTeamMember(db, { role: "ADMIN", serviceLines: ["WEB_DEVELOPMENT"] });
  await createProfileVersion(db, {
    serviceLine: "WEB_DEVELOPMENT",
    isActive: true,
    status: "PUBLISHED",
    createdById: creator.user.id,
  });

  const mgr = await createTeamMember(db, { role: "MANAGER", serviceLines: ["WEB_DEVELOPMENT"] });
  manager = actorOf({ id: mgr.user.id, role: "MANAGER" });
  const mem = await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] });
  member = actorOf({ id: mem.user.id, role: "MEMBER" });
  ownerId = mem.user.id;

  const packages = await getPricingForLine("WEB_DEVELOPMENT", "NIGERIA");
  packageId = packages[0]?.id ?? "";
  expect(packageId).not.toBe("");
});

afterAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

async function newLead() {
  const lead = await createLeadInStatus(db, "REPLIED", {
    serviceLine: "WEB_DEVELOPMENT",
    market: "NIGERIA",
    ownerId,
  });
  const contact = await createContact(db, { companyId: lead.companyId });
  await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: contact.id } });
  return { lead, contactId: contact.id };
}

describe("proposal flow", () => {
  it("creates, approves, renders a PDF, sends it and moves the lead to PROPOSAL_SENT (AC-34.3)", async () => {
    const { lead, contactId } = await newLead();
    const created = await createProposal(manager, lead.id, { packages: [{ packageId }] });
    expect(created.requiresApproval).toBe(false);
    expect(created.totalMinor).toBeGreaterThan(0);

    await approveProposal(manager, created.proposalId);
    expect((await db.proposal.findUnique({ where: { id: created.proposalId } }))?.status).toBe("APPROVED");

    const sent = await sendProposal(manager, created.proposalId, { contactId, message: "Our proposal is attached." });
    expect((await db.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("PROPOSAL_SENT");
    const proposal = await db.proposal.findUnique({ where: { id: created.proposalId } });
    expect(proposal?.status).toBe("SENT");
    expect(proposal?.pdfFileId).not.toBeNull();
    const message = await db.message.findUnique({ where: { id: sent.messageId } });
    expect(message?.status).toBe("SENT_MOCK");
    const file = await db.fileObject.findFirst({ where: { id: proposal?.pdfFileId ?? "" } });
    expect(file?.purpose).toBe("PROPOSAL_PDF");
  }, 30_000);

  it("needs manager approval when the discount exceeds the threshold (AC-34.2)", async () => {
    const { lead } = await newLead();
    const created = await createProposal(manager, lead.id, {
      packages: [{ packageId }],
      discount: { type: "PERCENT", valueBps: 1_500 },
    });
    expect(created.requiresApproval).toBe(true);
    expect((await db.proposal.findUnique({ where: { id: created.proposalId } }))?.status).toBe("PENDING_APPROVAL");

    // A member without canApprove can't approve an exception.
    await expect(approveProposal(member, created.proposalId)).rejects.toThrow(AppError);
    // A manager can.
    await approveProposal(manager, created.proposalId);
    expect((await db.proposal.findUnique({ where: { id: created.proposalId } }))?.status).toBe("APPROVED");
  }, 30_000);

  it("generates a pre-call brief with the price range from the profile (AC-33.3)", async () => {
    const { lead } = await newLead();
    const meeting = await createMeeting(
      manager,
      lead.id,
      { startsAt: new Date(Date.now() + 90 * 60 * 1000), endsAt: new Date(Date.now() + 120 * 60 * 1000) },
    );
    await regeneratePrecallBrief(manager, meeting.meetingId);
    const row = await db.meeting.findUnique({ where: { id: meeting.meetingId } });
    expect(row?.precallGeneratedAt).not.toBeNull();
    const brief = row?.precallBrief as { priceRangeToDiscuss: { currency: string } | null } | null;
    expect(brief?.priceRangeToDiscuss?.currency).toBe("NGN");
  }, 30_000);
});
