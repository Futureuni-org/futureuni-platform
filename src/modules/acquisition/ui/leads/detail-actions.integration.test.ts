import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/platform/auth";
import type * as AuthModule from "@/platform/auth";
import { db } from "@/platform/db";
import type * as AuditsModule from "@/modules/acquisition/audits";
import type * as OutreachModule from "@/modules/acquisition/outreach";
import type * as PipelineModule from "@/modules/acquisition/pipeline";
import type * as ScoringModule from "@/modules/acquisition/scoring";
import {
  createContact,
  createDeal,
  createHandoff,
  createLeadInStatus,
  createProposal,
  createTeamMember,
} from "@/tests/factories";

import {
  assignHandoffAction,
  markWonAction,
  priceQuoteAction,
  reauditAction,
  regenerateBriefAction,
  rescoreAction,
  sendOneOffAction,
  sendProposalAction,
  setPrimaryContactAction,
} from "./detail-actions";
import { sessionUser } from "./session.test-util";

/**
 * The rules these actions add in front of the services: who may regenerate a brief, which contact
 * an email or proposal may go to, which proposal a deal may be tied to, who can be made a delivery
 * owner, and when a re-score or re-audit is refused. Authentication is replaced by a session user;
 * the permission matrix, the repos and the database are real. The services that would call a
 * provider (AI, email) are replaced, and each test asserts whether they were reached.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
const services = vi.hoisted(() => ({
  generateBrief: vi.fn(),
  rescoreLead: vi.fn(),
  rerunAudit: vi.fn(),
  sendOneOffEmail: vi.fn(),
  sendProposal: vi.fn(),
  markWon: vi.fn(),
  assignHandoff: vi.fn(),
}));

vi.mock("@/platform/auth", async () => {
  const actual = await vi.importActual<typeof AuthModule>("@/platform/auth");
  return {
    ...actual,
    requireUser: () => {
      if (session.user === null) throw new Error("The test has no signed-in user.");
      return Promise.resolve(session.user);
    },
  };
});
vi.mock("@/modules/acquisition/scoring", async () => ({
  ...(await vi.importActual<typeof ScoringModule>("@/modules/acquisition/scoring")),
  generateBrief: services.generateBrief,
  rescoreLead: services.rescoreLead,
}));
vi.mock("@/modules/acquisition/audits", async () => ({
  ...(await vi.importActual<typeof AuditsModule>("@/modules/acquisition/audits")),
  rerunAudit: services.rerunAudit,
}));
vi.mock("@/modules/acquisition/outreach", async () => ({
  ...(await vi.importActual<typeof OutreachModule>("@/modules/acquisition/outreach")),
  sendOneOffEmail: services.sendOneOffEmail,
}));
vi.mock("@/modules/acquisition/pipeline", async () => ({
  ...(await vi.importActual<typeof PipelineModule>("@/modules/acquisition/pipeline")),
  sendProposal: services.sendProposal,
  markWon: services.markWon,
  assignHandoff: services.assignHandoff,
}));

let manager: CurrentUser;
let webLead: CurrentUser;
let owner: CurrentUser;
let otherMember: CurrentUser;
let videoMember: CurrentUser;

beforeAll(async () => {
  manager = sessionUser(await createTeamMember(db, { role: "MANAGER", serviceLines: [] }));
  webLead = sessionUser(
    await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  owner = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  otherMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  videoMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["VIDEO_EDITING"] }),
  );
});

beforeEach(() => {
  session.user = null;
  for (const service of Object.values(services)) service.mockReset();
});

function ownedLead(status: Parameters<typeof createLeadInStatus>[1] = "REPLIED") {
  return createLeadInStatus(db, status, { serviceLine: "WEB_DEVELOPMENT", ownerId: owner.id });
}

describe("regenerateBriefAction", () => {
  it("refuses a member who doesn't own the lead, before any AI call", async () => {
    const lead = await ownedLead();
    session.user = otherMember;

    const result = await regenerateBriefAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.generateBrief).not.toHaveBeenCalled();
  });

  it("refuses someone from another service line", async () => {
    const lead = await ownedLead();
    session.user = videoMember;

    const result = await regenerateBriefAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.generateBrief).not.toHaveBeenCalled();
  });

  it("regenerates for the lead's owner", async () => {
    const lead = await ownedLead();
    session.user = owner;

    const result = await regenerateBriefAction(lead.id);

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(services.generateBrief).toHaveBeenCalledOnce();
    expect(services.generateBrief).toHaveBeenCalledWith(lead.id, {
      actor: { type: "USER", userId: owner.id, role: "MEMBER" },
    });
  });

  it("answers not found for a lead that doesn't exist", async () => {
    session.user = manager;
    const result = await regenerateBriefAction("cmissingleadid0000000000");
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("setPrimaryContactAction", () => {
  it("refuses a contact from another company and leaves the lead unchanged", async () => {
    const lead = await ownedLead();
    const stranger = await createContact(db);
    session.user = owner;

    const result = await setPrimaryContactAction(lead.id, stranger.id);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.primaryContactId).toBeNull();
  });

  it("refuses a member who doesn't own the lead", async () => {
    const lead = await ownedLead();
    const contact = await createContact(db, { companyId: lead.companyId });
    session.user = otherMember;

    const result = await setPrimaryContactAction(lead.id, contact.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.primaryContactId).toBeNull();
  });

  it("sets a contact of the lead's own company", async () => {
    const lead = await ownedLead();
    const contact = await createContact(db, { companyId: lead.companyId });
    session.user = owner;

    const result = await setPrimaryContactAction(lead.id, contact.id);

    expect(result).toEqual({ ok: true, data: { ok: true } });
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.primaryContactId).toBe(contact.id);
  });
});

describe("priceQuoteAction", () => {
  it("refuses someone who can't create a proposal for the lead", async () => {
    const lead = await ownedLead();
    session.user = videoMember;

    const result = await priceQuoteAction(lead.id, { packages: [] });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("sendOneOffAction", () => {
  const email = {
    subject: "A quick follow-up",
    body: "Thanks for your time today.",
    humanConfirmedClaims: true as const,
  };

  it("refuses a contact that isn't the lead's company's, and sends nothing", async () => {
    const lead = await ownedLead();
    const stranger = await createContact(db);
    session.user = owner;

    const result = await sendOneOffAction({ ...email, leadId: lead.id, contactId: stranger.id });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sendOneOffEmail).not.toHaveBeenCalled();
  });

  it("refuses a member who doesn't own the lead, and sends nothing", async () => {
    const lead = await ownedLead();
    const contact = await createContact(db, { companyId: lead.companyId });
    session.user = otherMember;

    const result = await sendOneOffAction({ ...email, leadId: lead.id, contactId: contact.id });

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.sendOneOffEmail).not.toHaveBeenCalled();
  });

  it("refuses an email whose claims weren't confirmed", async () => {
    const lead = await ownedLead();
    const contact = await createContact(db, { companyId: lead.companyId });
    session.user = owner;

    const result = await sendOneOffAction({
      ...email,
      leadId: lead.id,
      contactId: contact.id,
      // What a tampered request would send in place of the confirmation.
      humanConfirmedClaims: false as unknown as true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sendOneOffEmail).not.toHaveBeenCalled();
  });
});

describe("sendProposalAction", () => {
  it("refuses a recipient who isn't a contact of the proposal's company", async () => {
    const lead = await ownedLead("MEETING_BOOKED");
    const proposal = await createProposal(db, { leadId: lead.id, status: "APPROVED" });
    const stranger = await createContact(db);
    session.user = owner;

    const result = await sendProposalAction(
      proposal.id,
      stranger.id,
      "Please find it attached.",
      true,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sendProposal).not.toHaveBeenCalled();
  });

  it("refuses to send without the confirmation", async () => {
    const lead = await ownedLead("MEETING_BOOKED");
    const proposal = await createProposal(db, { leadId: lead.id, status: "APPROVED" });
    const contact = await createContact(db, { companyId: lead.companyId });
    session.user = owner;

    const result = await sendProposalAction(
      proposal.id,
      contact.id,
      "Please find it attached.",
      false,
    );

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sendProposal).not.toHaveBeenCalled();
  });
});

describe("markWonAction", () => {
  it("refuses to tie the deal to another lead's proposal", async () => {
    const lead = await ownedLead("PROPOSAL_SENT");
    const elsewhere = await createProposal(db);
    session.user = owner;

    const result = await markWonAction(lead.id, {
      valueMinor: 150_000_000,
      currency: "NGN",
      services: ["WEB_DEVELOPMENT"],
      proposalId: elsewhere.id,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.markWon).not.toHaveBeenCalled();
  });

  it("passes the lead's own proposal through to the service", async () => {
    const lead = await ownedLead("PROPOSAL_SENT");
    const proposal = await createProposal(db, { leadId: lead.id, status: "SENT" });
    services.markWon.mockResolvedValue({ dealId: "deal", handoffId: "handoff" });
    session.user = owner;

    const result = await markWonAction(lead.id, {
      valueMinor: 150_000_000,
      currency: "NGN",
      services: ["WEB_DEVELOPMENT"],
      proposalId: proposal.id,
    });

    expect(result).toEqual({ ok: true, data: { dealId: "deal", handoffId: "handoff" } });
    expect(services.markWon).toHaveBeenCalledOnce();
  });
});

describe("assignHandoffAction", () => {
  async function wonHandoff() {
    const lead = await createLeadInStatus(db, "WON", { serviceLine: "WEB_DEVELOPMENT" });
    const deal = await createDeal(db, { leadId: lead.id });
    return createHandoff(db, { dealId: deal.id });
  }

  it("refuses anyone below manager", async () => {
    const handoff = await wonHandoff();
    session.user = webLead;

    const result = await assignHandoffAction(handoff.id, "WEB_DEVELOPMENT", owner.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.assignHandoff).not.toHaveBeenCalled();
  });

  it("refuses a service the deal didn't sell", async () => {
    const handoff = await wonHandoff();
    session.user = manager;

    const result = await assignHandoffAction(handoff.id, "VIDEO_EDITING", videoMember.id);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignHandoff).not.toHaveBeenCalled();
  });

  it("refuses a delivery owner who isn't on the service's team", async () => {
    const handoff = await wonHandoff();
    session.user = manager;

    const result = await assignHandoffAction(handoff.id, "WEB_DEVELOPMENT", videoMember.id);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignHandoff).not.toHaveBeenCalled();
  });

  it("assigns a member of the service's team", async () => {
    const handoff = await wonHandoff();
    session.user = manager;

    const result = await assignHandoffAction(handoff.id, "WEB_DEVELOPMENT", owner.id);

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(services.assignHandoff).toHaveBeenCalledOnce();
  });
});

describe("re-score and re-audit preconditions", () => {
  it("refuses a re-score for a lead in review, instead of reporting one that didn't happen", async () => {
    const lead = await ownedLead("IN_REVIEW");
    session.user = owner;

    const result = await rescoreAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(services.rescoreLead).not.toHaveBeenCalled();
  });

  it("refuses a re-audit once the lead is past the audit stage", async () => {
    const lead = await ownedLead("REPLIED");
    session.user = owner;

    const result = await reauditAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(services.rerunAudit).not.toHaveBeenCalled();
  });

  it("reports a re-audit the run skipped as a conflict, not a success", async () => {
    const lead = await ownedLead("AUDITED");
    services.rerunAudit.mockResolvedValue({ status: "NOT_APPLICABLE" });
    session.user = owner;

    const result = await reauditAction(lead.id);

    expect(services.rerunAudit).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("checks permission before status, so a stranger learns nothing about the lead", async () => {
    const lead = await ownedLead("IN_REVIEW");
    session.user = otherMember;

    expect(await rescoreAction(lead.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await reauditAction(lead.id)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
