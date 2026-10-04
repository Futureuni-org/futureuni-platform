import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/platform/auth";
import type * as AuthModule from "@/platform/auth";
import { db } from "@/platform/db";
import type * as InboxModule from "@/modules/acquisition/inbox";
import {
  createCompany,
  createLead,
  createLeadInStatus,
  createReply,
  createTeamMember,
  uniqueToken,
} from "@/tests/factories";

import { sessionUser } from "../leads/session.test-util";
import {
  assignThreadAction,
  linkReplyAction,
  regenerateDraftAction,
  searchLeadsAction,
  sendReplyAction,
} from "./actions";

/**
 * The rules the inbox actions add in front of the inbox service: an unsubscribe is never answered,
 * only an unmatched reply can be linked, a thread can only be assigned within its line's team, and
 * the lead search is limited to people who may link in that line. Authentication is replaced by a
 * session user; the permission matrix, the repos and the database are real. The service calls that
 * would send, link, assign or call the AI are replaced, and each test asserts whether they ran.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
const services = vi.hoisted(() => ({
  sendReply: vi.fn(),
  linkReply: vi.fn(),
  assignThread: vi.fn(),
  generateReplyDraft: vi.fn(),
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
vi.mock("@/modules/acquisition/inbox", async () => ({
  ...(await vi.importActual<typeof InboxModule>("@/modules/acquisition/inbox")),
  sendReply: services.sendReply,
  linkReply: services.linkReply,
  assignThread: services.assignThread,
  generateReplyDraft: services.generateReplyDraft,
}));

let manager: CurrentUser;
let webLead: CurrentUser;
let videoLead: CurrentUser;
let owner: CurrentUser;
let otherMember: CurrentUser;

beforeAll(async () => {
  manager = sessionUser(await createTeamMember(db, { role: "MANAGER", serviceLines: [] }));
  webLead = sessionUser(
    await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  videoLead = sessionUser(
    await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["VIDEO_EDITING"] }),
  );
  owner = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  otherMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
});

beforeEach(() => {
  session.user = null;
  for (const service of Object.values(services)) service.mockReset();
});

function ownedLead(status: Parameters<typeof createLeadInStatus>[1] = "REPLIED") {
  return createLeadInStatus(db, status, { serviceLine: "WEB_DEVELOPMENT", ownerId: owner.id });
}

const CONFIRMED = { body: "Thanks, Thursday works for us.", humanConfirmedClaims: true as const };

describe("sendReplyAction", () => {
  it("never answers an unsubscribe", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id, classification: "UNSUBSCRIBE" });
    session.user = owner;

    const result = await sendReplyAction(reply.id, CONFIRMED);

    expect(result).toMatchObject({ ok: false, error: { code: "SUPPRESSED" } });
    expect(services.sendReply).not.toHaveBeenCalled();
  });

  it("doesn't answer a bounce", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id, classification: "BOUNCE" });
    session.user = owner;

    const result = await sendReplyAction(reply.id, CONFIRMED);

    expect(result).toMatchObject({ ok: false, error: { code: "CONTACT_BLOCKED" } });
    expect(services.sendReply).not.toHaveBeenCalled();
  });

  it("doesn't message a suppressed lead, whatever the reply's class", async () => {
    const lead = await ownedLead("SUPPRESSED");
    const reply = await createReply(db, { leadId: lead.id, classification: "INTERESTED" });
    session.user = owner;

    const result = await sendReplyAction(reply.id, CONFIRMED);

    expect(result).toMatchObject({ ok: false, error: { code: "SUPPRESSED" } });
    expect(services.sendReply).not.toHaveBeenCalled();
  });

  it("refuses a member who doesn't own the lead", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id });
    session.user = otherMember;

    const result = await sendReplyAction(reply.id, CONFIRMED);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.sendReply).not.toHaveBeenCalled();
  });

  it("refuses a reply that wasn't confirmed", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id });
    session.user = owner;

    const result = await sendReplyAction(reply.id, {
      body: CONFIRMED.body,
      // What a tampered request would send in place of the confirmation.
      humanConfirmedClaims: false as unknown as true,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.sendReply).not.toHaveBeenCalled();
  });
});

describe("regenerateDraftAction", () => {
  it("refuses a member who doesn't own the lead, before any AI call", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id });
    session.user = otherMember;

    const result = await regenerateDraftAction(reply.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.generateReplyDraft).not.toHaveBeenCalled();
  });

  it("writes no suggested response to an unsubscribe", async () => {
    const lead = await ownedLead();
    const reply = await createReply(db, { leadId: lead.id, classification: "UNSUBSCRIBE" });
    session.user = owner;

    const result = await regenerateDraftAction(reply.id);

    expect(result).toMatchObject({ ok: false, error: { code: "SUPPRESSED" } });
    expect(services.generateReplyDraft).not.toHaveBeenCalled();
  });
});

describe("linkReplyAction", () => {
  it("refuses to move a reply that already belongs to a lead", async () => {
    const current = await ownedLead();
    const reply = await createReply(db, { leadId: current.id });
    const target = await ownedLead();
    session.user = manager;

    const result = await linkReplyAction(reply.id, target.id);

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(services.linkReply).not.toHaveBeenCalled();
  });

  it("links an unmatched reply for someone who manages the target lead's line", async () => {
    const reply = await createReply(db, { leadId: null });
    const target = await ownedLead();
    session.user = webLead;

    const result = await linkReplyAction(reply.id, target.id);

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(services.linkReply).toHaveBeenCalledOnce();
  });

  it("refuses a service lead of another line, and a member", async () => {
    const reply = await createReply(db, { leadId: null });
    const target = await ownedLead();

    session.user = videoLead;
    expect(await linkReplyAction(reply.id, target.id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    session.user = owner;
    expect(await linkReplyAction(reply.id, target.id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(services.linkReply).not.toHaveBeenCalled();
  });
});

describe("assignThreadAction", () => {
  it("refuses an assignee who isn't on the line's team", async () => {
    const lead = await ownedLead();
    session.user = webLead;

    const result = await assignThreadAction(lead.id, videoLead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(services.assignThread).not.toHaveBeenCalled();
  });

  it("refuses a member, who may not assign threads", async () => {
    const lead = await ownedLead();
    session.user = owner;

    const result = await assignThreadAction(lead.id, otherMember.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(services.assignThread).not.toHaveBeenCalled();
  });

  it("assigns to a member of the line's team", async () => {
    const lead = await ownedLead();
    session.user = webLead;

    const result = await assignThreadAction(lead.id, otherMember.id);

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(services.assignThread).toHaveBeenCalledOnce();
  });
});

describe("searchLeadsAction", () => {
  it("refuses a member, who can't link replies", async () => {
    session.user = owner;
    const result = await searchLeadsAction("WEB_DEVELOPMENT", "acme");
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("refuses a service lead searching another line", async () => {
    session.user = videoLead;
    const result = await searchLeadsAction("WEB_DEVELOPMENT", "acme");
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("finds leads in the line by name, matching the text literally", async () => {
    const token = uniqueToken();
    const { id: companyId } = await createCompany(db, { name: `Searchable ${token}` });
    const lead = await createLead(db, { companyId, serviceLine: "WEB_DEVELOPMENT" });
    session.user = webLead;

    const found = await searchLeadsAction("WEB_DEVELOPMENT", token);
    expect(found.ok && found.data.map((match) => match.id)).toEqual([lead.id]);

    // As a wildcard "%%" would match every lead in the line, newest first, so this one too.
    const wildcard = await searchLeadsAction("WEB_DEVELOPMENT", "%%");
    expect(wildcard.ok && wildcard.data.some((match) => match.id === lead.id)).toBe(false);
  });
});
