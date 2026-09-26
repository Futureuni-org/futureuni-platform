import { describe, expect, it } from "vitest";

import type { Actor, LeadStatus } from "@/contracts/common";
import { db, withTransaction } from "@/platform/db";

import {
  createLead,
  createLeadInStatus,
  fixedClock,
  FIXED_NOW,
  withRollback,
} from "../../../../tests/factories";

import {
  NURTURE_REASONS_FROM,
  canTransition,
  LEAD_TRANSITIONS,
  recordLeadCreation,
  transitionLead,
} from "./lead-state";

const actor: Actor = { type: "SYSTEM", job: "acquisition.test.transitions" };

/** Every allowed (from, to) pair in the §5.2 table. */
const ALLOWED = (Object.entries(LEAD_TRANSITIONS) as [LeadStatus, readonly LeadStatus[]][]).flatMap(
  ([from, tos]) => tos.map((to) => [from, to] as const),
);

describe("the allowed-transitions table (module spec §5.2)", () => {
  it("covers the table's transitions and nothing else", () => {
    expect(ALLOWED).toHaveLength(58);
    expect(LEAD_TRANSITIONS.WON).toEqual([]);
    expect(LEAD_TRANSITIONS.SUPPRESSED).toEqual([]);
    expect(LEAD_TRANSITIONS.DISQUALIFIED).toEqual(["SUPPRESSED"]);
    // Suppression is reachable from every status except WON and SUPPRESSED.
    for (const [from, tos] of Object.entries(LEAD_TRANSITIONS)) {
      expect(tos.includes("SUPPRESSED")).toBe(!["WON", "SUPPRESSED"].includes(from));
    }
  });

  it.each([
    ["NEW", "AUDITED"],
    ["NEW", "SCORED"],
    ["CONTACTED", "SCORED"], // a score change never moves a contacted lead back
    ["WON", "LOST"],
    ["WON", "NURTURE"],
    ["SUPPRESSED", "NEW"],
    ["DISQUALIFIED", "NEW"],
    ["LOST", "REPLIED"],
    ["IN_REVIEW", "CONTACTED"],
    ["IN_REVIEW", "NURTURE"], // drawn in the §5.2 diagram but not in the table
    ["APPROVED", "NURTURE"],
    ["NEW", "NEW"],
  ] as const)("refuses %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("releases NURTURE → SCORED only from a CAPACITY or COMPLIANCE hold", () => {
    expect(canTransition("NURTURE", "SCORED", { nurtureReason: "CAPACITY" })).toBe(true);
    expect(canTransition("NURTURE", "SCORED", { nurtureReason: "COMPLIANCE" })).toBe(true);
    for (const reason of ["NOT_NOW", "LOW_SCORE", "REENGAGE", "MANUAL"] as const) {
      expect(canTransition("NURTURE", "SCORED", { nurtureReason: reason })).toBe(false);
    }
    expect(canTransition("NURTURE", "SCORED")).toBe(false);
    // A score change never moves a contacted lead backwards.
    expect(
      canTransition("NURTURE", "SCORED", {
        nurtureReason: "CAPACITY",
        firstContactedAt: FIXED_NOW,
      }),
    ).toBe(false);
  });
});

describe("nurture reasons (§5.2 table)", () => {
  it("refuses a reason the starting status can't park a lead with", () =>
    withRollback(async (tx) => {
      const contacted = await createLeadInStatus(tx, "CONTACTED");
      await expect(
        transitionLead(tx, {
          leadId: contacted.id,
          to: "NURTURE",
          actor,
          nurtureReason: "CAPACITY",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      const lost = await createLeadInStatus(tx, "LOST");
      await expect(
        transitionLead(tx, { leadId: lost.id, to: "NURTURE", actor, nurtureReason: "NOT_NOW" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      const parked = await transitionLead(tx, {
        leadId: contacted.id,
        to: "NURTURE",
        actor,
        nurtureReason: "NOT_NOW",
      });
      expect(parked.lead.nurtureReason).toBe("NOT_NOW");
    }));

  it("answers CONFLICT, and keeps the transaction usable, when LOST → NURTURE meets another open lead", () =>
    withRollback(async (tx) => {
      const lost = await createLeadInStatus(tx, "LOST");
      await createLeadInStatus(tx, "SCORED", {
        companyId: lost.companyId,
        serviceLine: lost.serviceLine,
        market: lost.market,
      });
      await expect(
        transitionLead(tx, { leadId: lost.id, to: "NURTURE", actor, nurtureReason: "REENGAGE" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await tx.lead.findUnique({ where: { id: lost.id } })).toMatchObject({
        status: "LOST",
      });
    }));
});

describe("transitionLead", () => {
  it.each(ALLOWED)(
    "%s → %s succeeds and writes its LeadEvent in the same transaction (INV-1)",
    (from, to) =>
      withRollback(async (tx) => {
        const lead = await createLeadInStatus(tx, from);
        const { lead: updated, event } = await transitionLead(tx, {
          leadId: lead.id,
          to,
          actor,
          ...(to === "NURTURE"
            ? { nurtureReason: NURTURE_REASONS_FROM[from]?.[0] ?? "MANUAL" }
            : {}),
          ...(to === "DISQUALIFIED" ? { reason: "disqualifier:competitor_agency" } : {}),
          clock: fixedClock,
        });
        expect(updated.status).toBe(to);
        expect(event).toMatchObject({
          leadId: lead.id,
          kind: "STATUS_CHANGE",
          fromStatus: from,
          toStatus: to,
          actorType: "SYSTEM",
          actorId: null,
          actorLabel: "acquisition.test.transitions",
        });
        expect(await tx.leadEvent.count({ where: { leadId: lead.id } })).toBe(1);
      }),
  );

  it("P2-AC5: NEW → AUDITED fails with INVALID_TRANSITION and writes no LeadEvent (INV-15)", () =>
    withRollback(async (tx) => {
      const lead = await createLead(tx);
      await expect(
        transitionLead(tx, { leadId: lead.id, to: "AUDITED", actor }),
      ).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
        details: { from: "NEW", to: "AUDITED" },
      });
      expect(await tx.leadEvent.count({ where: { leadId: lead.id } })).toBe(0);
      expect((await tx.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW");
    }));

  it("refuses to release a NOT_NOW nurture lead back to SCORED", () =>
    withRollback(async (tx) => {
      const lead = await createLeadInStatus(tx, "NURTURE", { nurtureReason: "NOT_NOW" });
      await expect(
        transitionLead(tx, { leadId: lead.id, to: "SCORED", actor }),
      ).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
    }));

  it("treats re-entering the same status as no transition: no event, no change", () =>
    withRollback(async (tx) => {
      const lead = await createLeadInStatus(tx, "SCORED");
      const result = await transitionLead(tx, { leadId: lead.id, to: "SCORED", actor });
      expect(result.event).toBeNull();
      expect(result.lead.updatedAt).toEqual(lead.updatedAt);
      expect(await tx.leadEvent.count({ where: { leadId: lead.id } })).toBe(0);
    }));

  it("needs a nurture reason for NURTURE and a reason for DISQUALIFIED", () =>
    withRollback(async (tx) => {
      const lead = await createLeadInStatus(tx, "AUDITED");
      await expect(
        transitionLead(tx, { leadId: lead.id, to: "NURTURE", actor }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      await expect(
        transitionLead(tx, { leadId: lead.id, to: "DISQUALIFIED", actor, reason: "  " }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    }));

  it("sets and clears the side fields: closedAt, nurtureReason, disqualifyReason, firstContactedAt", () =>
    withRollback(async (tx) => {
      const approved = await createLeadInStatus(tx, "APPROVED");
      const contacted = await transitionLead(tx, {
        leadId: approved.id,
        to: "CONTACTED",
        actor,
        clock: fixedClock,
      });
      expect(contacted.lead).toMatchObject({
        firstContactedAt: FIXED_NOW,
        lastActivityAt: FIXED_NOW,
        closedAt: null,
      });

      const lost = await transitionLead(tx, {
        leadId: approved.id,
        to: "LOST",
        actor,
        reason: "PRICE",
        clock: fixedClock,
      });
      expect(lost.lead.closedAt).toEqual(FIXED_NOW);

      const reengaged = await transitionLead(tx, {
        leadId: approved.id,
        to: "NURTURE",
        actor,
        nurtureReason: "REENGAGE",
      });
      expect(reengaged.lead).toMatchObject({
        status: "NURTURE",
        closedAt: null,
        nurtureReason: "REENGAGE",
      });

      const disqualified = await transitionLead(tx, {
        leadId: approved.id,
        to: "DISQUALIFIED",
        actor: { type: "USER", userId: "cm1user00000000000000000001", role: "SERVICE_LEAD" },
        reason: "manual:duplicate lead",
      });
      expect(disqualified.lead).toMatchObject({
        nurtureReason: null,
        disqualifyReason: "manual:duplicate lead",
      });
      expect(disqualified.lead.closedAt).not.toBeNull();
      expect(disqualified.event).toMatchObject({
        actorType: "USER",
        actorId: "cm1user00000000000000000001",
        actorLabel: null,
      });
    }));

  it("reports an unknown lead as NOT_FOUND", () =>
    withRollback(async (tx) => {
      await expect(
        transitionLead(tx, { leadId: "cm1missing000000000000000001", to: "ENRICHING", actor }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));

  it("leaves no status change and no event when the transaction rolls back (INV-1)", async () => {
    const lead = await withTransaction((tx) => createLead(tx));
    try {
      await expect(
        withTransaction(async (tx) => {
          await transitionLead(tx, { leadId: lead.id, to: "ENRICHING", actor });
          throw new Error("the caller's next step failed");
        }),
      ).rejects.toThrow("the caller's next step failed");
      expect(await db.leadEvent.count({ where: { leadId: lead.id } })).toBe(0);
      expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW");
    } finally {
      await db.lead.delete({ where: { id: lead.id } });
      await db.company.delete({ where: { id: lead.companyId } });
    }
  });

  it("lets only one of two concurrent transitions win; the other gets CONFLICT", async () => {
    const lead = await withTransaction((tx) => createLead(tx));
    try {
      const results = await Promise.allSettled([
        withTransaction((tx) => transitionLead(tx, { leadId: lead.id, to: "ENRICHING", actor })),
        withTransaction((tx) => transitionLead(tx, { leadId: lead.id, to: "ENRICHING", actor })),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      // The loser either reads ENRICHING after the winner commits (a no-op) or loses the conditional
      // update while the winner holds the row (CONFLICT). Either way only one change is recorded.
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      for (const result of rejected) expect(result.reason).toMatchObject({ code: "CONFLICT" });
      expect(await db.leadEvent.count({ where: { leadId: lead.id } })).toBe(1);
    } finally {
      await db.leadEvent.deleteMany({ where: { leadId: lead.id } });
      await db.lead.delete({ where: { id: lead.id } });
      await db.company.delete({ where: { id: lead.companyId } });
    }
  });
});

describe("recordLeadCreation", () => {
  it("writes the — → NEW event for a new lead", () =>
    withRollback(async (tx) => {
      const lead = await createLead(tx);
      const event = await recordLeadCreation(tx, {
        leadId: lead.id,
        actor: { type: "SYSTEM", job: "acquisition.sourcing.run" },
        meta: { searchRunId: "cm1run00000000000000000001" },
      });
      expect(event).toMatchObject({
        fromStatus: null,
        toStatus: "NEW",
        actorLabel: "acquisition.sourcing.run",
      });
    }));

  it("refuses a lead that has moved on", () =>
    withRollback(async (tx) => {
      const lead = await createLeadInStatus(tx, "ENRICHED");
      await expect(recordLeadCreation(tx, { leadId: lead.id, actor })).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
    }));
});
