import { beforeAll, describe, expect, it } from "vitest";

import type { Actor, LostReason } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorOf } from "@/platform/auth";
import { db } from "@/platform/db";
import {
  createEnrollment,
  createLeadInStatus,
  createProposal,
  createTeamMember,
} from "@/tests/factories";

import { getPipeline } from "./board/board";
import { assignHandoff, markLost, markWon, releaseDueReengagements } from "./deals/deals";
import { createMeeting } from "./meetings/meetings";

let manager: Actor;
let ownerId: string;

beforeAll(async () => {
  const mgr = await createTeamMember(db, { role: "MANAGER", serviceLines: ["WEB_DEVELOPMENT"] });
  manager = actorOf({ id: mgr.user.id, role: "MANAGER" });
  const owner = await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"] });
  ownerId = owner.user.id;
});

describe("pipeline board", () => {
  it("totals each currency separately, never summed (AC-32.1, INV-11)", async () => {
    const owner = await createTeamMember(db, { role: "SERVICE_LEAD", serviceLines: ["WEB_DEVELOPMENT"] });
    const boardOwnerId = owner.user.id;
    const ng = await createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", ownerId: boardOwnerId });
    const intl = await createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", market: "INTERNATIONAL", ownerId: boardOwnerId });
    await createProposal(db, { leadId: ng.id, currency: "NGN", subtotalMinor: 150_000_000, totalMinor: 150_000_000 });
    await createProposal(db, { leadId: intl.id, currency: "USD", subtotalMinor: 500_000, totalMinor: 500_000 });

    const board = await getPipeline(manager, { serviceLine: "WEB_DEVELOPMENT", ownerId: boardOwnerId });
    const replied = board.columns.find((c) => c.status === "REPLIED");
    expect(replied?.count).toBe(2);
    expect(replied?.totalsByCurrency.NGN).toBe(150_000_000);
    expect(replied?.totalsByCurrency.USD).toBe(500_000);
    // Never a combined total.
    expect(Object.keys(replied?.totalsByCurrency ?? {}).sort()).toEqual(["NGN", "USD"]);
  });
});

describe("manual meeting", () => {
  it("books a meeting, moves the lead to MEETING_BOOKED and stops the company's enrolments (AC-33.5, INV-3)", async () => {
    const now = new Date("2026-10-15T09:00:00Z");
    const lead = await createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", ownerId });
    const enrollment = await createEnrollment(db, { leadId: lead.id });

    await createMeeting(
      manager,
      lead.id,
      { startsAt: new Date("2026-11-01T10:00:00Z"), endsAt: new Date("2026-11-01T10:30:00Z"), location: "WhatsApp call" },
      { now: () => now },
    );

    const updated = await db.lead.findUnique({ where: { id: lead.id } });
    expect(updated?.status).toBe("MEETING_BOOKED");
    const meeting = await db.meeting.findFirst({ where: { leadId: lead.id } });
    expect(meeting?.source).toBe("MANUAL");
    const stopped = await db.enrollment.findUnique({ where: { id: enrollment.id } });
    expect(stopped?.status).toBe("STOPPED");
    expect(stopped?.stoppedReason).toBe("MEETING_BOOKED");
  });
});

describe("won and handoff", () => {
  it("creates a deal and a handoff with a suggested assignee, then recalculates load on assignment (AC-35.1, AC-35.2)", async () => {
    const now = new Date("2026-10-16T09:00:00Z");
    const assignee = await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"], profile: { weeklyCapacity: 6, currentLoad: 0 } });
    const lead = await createLeadInStatus(db, "MEETING_BOOKED", { serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", ownerId });

    const { dealId, handoffId } = await markWon(
      manager,
      lead.id,
      { valueMinor: 180_000_000, currency: "NGN", services: ["WEB_DEVELOPMENT"] },
      { now: () => now },
    );

    expect((await db.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("WON");
    expect((await db.deal.findUnique({ where: { id: dealId } }))?.outcome).toBe("WON");
    const handoff = await db.handoff.findUnique({ where: { id: handoffId }, include: { assignments: true } });
    expect(handoff?.assignments).toHaveLength(1);
    expect(handoff?.assignments[0]?.serviceLine).toBe("WEB_DEVELOPMENT");
    expect(handoff?.assignments[0]?.suggestedUserId).not.toBeNull();

    await assignHandoff(manager, handoffId, { serviceLine: "WEB_DEVELOPMENT", userId: assignee.user.id }, { now: () => now });
    const profile = await db.teamProfile.findUnique({ where: { userId: assignee.user.id } });
    expect(profile?.currentLoad).toBe(1);
  });
});

describe("lost and re-engagement", () => {
  it("refuses a lost move with no reason (AC-35.4)", async () => {
    const lead = await createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", ownerId });
    await expect(markLost(manager, lead.id, { reason: "" as LostReason })).rejects.toThrow(AppError);
  });

  it("records a lost deal with a re-engagement date and releases it to NURTURE on the day (AC-35.3)", async () => {
    const lead = await createLeadInStatus(db, "REPLIED", { serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", ownerId });
    await markLost(
      manager,
      lead.id,
      { reason: "TIMING", reengageAt: new Date("2026-06-01T00:00:00Z") },
      { now: () => new Date("2026-05-01T09:00:00Z") },
    );
    expect((await db.lead.findUnique({ where: { id: lead.id } }))?.status).toBe("LOST");

    const result = await releaseDueReengagements(new Date("2026-06-02T06:00:00Z"));
    expect(result.released).toBeGreaterThanOrEqual(1);
    const reengaged = await db.lead.findUnique({ where: { id: lead.id } });
    expect(reengaged?.status).toBe("NURTURE");
    expect(reengaged?.nurtureReason).toBe("REENGAGE");
  });
});
