import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/platform/auth";
import type * as AuthModule from "@/platform/auth";
import { db } from "@/platform/db";
import type * as PipelineModule from "@/modules/acquisition/pipeline";
import { createLeadInStatus, createTeamMember } from "@/tests/factories";

import { sessionUser } from "../leads/session.test-util";
import { boardBookingLinkAction } from "./actions";

/**
 * `getBookingLink` has no permission check of its own, so the board's action is the only gate on
 * it. Authentication is replaced by a session user; the permission matrix and the database are
 * real; the booking-link service is replaced and each test asserts whether it was reached.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));
const getBookingLink = vi.hoisted(() => vi.fn());

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
vi.mock("@/modules/acquisition/pipeline", async () => ({
  ...(await vi.importActual<typeof PipelineModule>("@/modules/acquisition/pipeline")),
  getBookingLink,
}));

let owner: CurrentUser;
let otherMember: CurrentUser;
let videoLead: CurrentUser;

beforeAll(async () => {
  owner = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  otherMember = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  videoLead = sessionUser(
    await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["VIDEO_EDITING"] }),
  );
});

beforeEach(() => {
  session.user = null;
  getBookingLink.mockReset();
  getBookingLink.mockResolvedValue("https://cal.example/book/abc");
});

function ownedLead() {
  return createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", ownerId: owner.id });
}

describe("boardBookingLinkAction", () => {
  it("refuses a member who doesn't own the lead", async () => {
    const lead = await ownedLead();
    session.user = otherMember;

    const result = await boardBookingLinkAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(getBookingLink).not.toHaveBeenCalled();
  });

  it("refuses a service lead of another line", async () => {
    const lead = await ownedLead();
    session.user = videoLead;

    const result = await boardBookingLinkAction(lead.id);

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(getBookingLink).not.toHaveBeenCalled();
  });

  it("returns the link for the lead's owner", async () => {
    const lead = await ownedLead();
    session.user = owner;

    const result = await boardBookingLinkAction(lead.id);

    expect(result).toEqual({ ok: true, data: { url: "https://cal.example/book/abc" } });
    expect(getBookingLink).toHaveBeenCalledWith(lead.id, owner.id);
  });

  it("answers not found for a lead that doesn't exist", async () => {
    session.user = owner;
    const result = await boardBookingLinkAction("cmissingleadid0000000000");
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(getBookingLink).not.toHaveBeenCalled();
  });
});
