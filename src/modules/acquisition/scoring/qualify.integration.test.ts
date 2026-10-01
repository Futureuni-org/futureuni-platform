/**
 * Integration tests for scoring, qualification, briefs, the borderline review, cross-sell and capacity
 * release (Phase 11). Real test database, mock AI providers, controlled clock. The active profiles are
 * seeded with a simple, signal-driven scoring block so the band is deterministic.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Actor, JsonValue, Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { registerTask } from "@/platform/ai";
import { db, toJsonInput, withTransaction, type Tx } from "@/platform/db";
import {
  buildValidProfile,
  createCompany,
  createContact,
  createLeadInStatus,
  createProfileVersion,
  createSignal,
  createTeamMember,
  createUser,
} from "@/tests/factories";

import { detectCrossSell, getCrossSellContext } from "@/modules/acquisition/crosssell";
import { assignLead, disqualifyLead, qualifyLead } from "./qualify";
import { overrideReview } from "./review";
import { refreshLineCapacity } from "./throttle";
import { borderlineReviewTask, leadBriefTask } from "./tasks";

const SYSTEM: Actor = { type: "SYSTEM", job: "acquisition.scoring.lead" };
const NOTE = "test version (scoring)";
const clock = { now: () => new Date("2026-10-01T10:00:00Z") };

let managerId = "";
let managerActor: Actor;
const companyIds: string[] = [];
const createdUserIds: string[] = [];

/** A signal-driven scoring profile: sig_a+sig_b = 70 (QUALIFIED), sig_mid = 50 (BORDERLINE), none = 0. */
function controlledProfile(line: ServiceLine): ServiceLineProfile {
  const base = buildValidProfile(line);
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
    signals: [...base.signals, sig("sig_a"), sig("sig_b"), sig("sig_mid")],
    scoring: {
      rules: [
        { id: "sig_a", label: "Signal A", condition: { all: [{ kind: "signal", signalId: "sig_a", negate: false }] }, points: 40 },
        { id: "sig_b", label: "Signal B", condition: { all: [{ kind: "signal", signalId: "sig_b", negate: false }] }, points: 30 },
        { id: "sig_mid", label: "Signal mid", condition: { all: [{ kind: "signal", signalId: "sig_mid", negate: false }] }, points: 50 },
      ],
      qualifyThreshold: 61,
      borderlineBand: { min: 40, max: 60 },
      lowScoreAction: "DISQUALIFY",
    },
    disqualifiers: [
      {
        id: "active_client",
        label: "Already a client",
        description: "Active FUTUREUNI client.",
        condition: { all: [{ kind: "field", field: "company.isActiveClient", op: "eq", value: true }] },
      },
    ],
  };
}

async function seedProfile(line: ServiceLine): Promise<void> {
  await db.serviceLineProfileVersion.deleteMany({ where: { serviceLine: line, note: NOTE } });
  await db.serviceLineProfileVersion.updateMany({ where: { serviceLine: line, isActive: true }, data: { isActive: false } });
  await withTransaction((tx) =>
    createProfileVersion(tx, {
      serviceLine: line,
      isActive: true,
      status: "PUBLISHED",
      note: NOTE,
      createdById: managerId,
      profile: toJsonInput(controlledProfile(line) as unknown as JsonValue),
    }),
  );
}

async function createMember(role: "MEMBER" | "SERVICE_LEAD", lines: ServiceLine[], capacity = 0): Promise<string> {
  const member = await withTransaction((tx) =>
    createTeamMember(tx, { role, serviceLines: lines, ...(capacity > 0 ? { profile: { weeklyCapacity: capacity } } : {}) }),
  );
  createdUserIds.push(member.user.id);
  return member.user.id;
}

/** An AUDITED international lead (GB + LIMITED → email ALLOWED) with the given scoring signals. */
async function makeAuditedLead(opts: {
  line?: ServiceLine;
  signalTypes?: string[];
  isActiveClient?: boolean;
}): Promise<{ leadId: string; companyId: string }> {
  const line = opts.line ?? "WEB_DEVELOPMENT";
  return withTransaction(async (tx: Tx) => {
    const company = await createCompany(tx, {
      country: "GB",
      legalForm: "LIMITED",
      ...(opts.isActiveClient ? { isActiveClient: true } : {}),
    });
    companyIds.push(company.id);
    const contact = await createContact(tx, { companyId: company.id, emailStatus: "VALID", emailType: "PERSONAL" });
    const lead = await createLeadInStatus(tx, "AUDITED", {
      companyId: company.id,
      serviceLine: line,
      market: "INTERNATIONAL",
      primaryContactId: contact.id,
      ownerId: managerId,
    });
    for (const signalType of opts.signalTypes ?? []) {
      await createSignal(tx, { companyId: company.id, leadId: lead.id, serviceLine: line, signalType });
    }
    return { leadId: lead.id, companyId: company.id };
  });
}

beforeAll(async () => {
  registerTask(borderlineReviewTask);
  registerTask(leadBriefTask);
  const manager = await withTransaction((tx) => createUser(tx, { role: "MANAGER" }));
  managerId = manager.id;
  createdUserIds.push(managerId);
  managerActor = { type: "USER", userId: managerId, role: "MANAGER" };
  // WEB_DEVELOPMENT gets capacity so qualified leads reach SCORED (not held).
  await createMember("SERVICE_LEAD", ["WEB_DEVELOPMENT"], 50);
  await seedProfile("WEB_DEVELOPMENT");
  await seedProfile("GRAPHIC_DESIGN");
});

afterEach(async () => {
  for (const companyId of companyIds) {
    const leads = await db.lead.findMany({ where: { companyId }, select: { id: true } });
    const leadIds = leads.map((l) => l.id);
    await db.scoreReview.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.leadEvent.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.audit.deleteMany({ where: { companyId } });
    await db.signal.deleteMany({ where: { companyId } });
    await db.crossSellGroup.deleteMany({ where: { companyId } });
    await db.lead.deleteMany({ where: { companyId } });
    await db.contact.deleteMany({ where: { companyId } });
    await db.company.deleteMany({ where: { id: companyId } });
  }
  companyIds.length = 0;
  await db.lineCapacityState.deleteMany({ where: { serviceLine: "GRAPHIC_DESIGN" } });
});

afterAll(async () => {
  await db.serviceLineProfileVersion.deleteMany({ where: { note: NOTE } });
  await db.teamProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await db.lineCapacityState.deleteMany({ where: { serviceLine: { in: ["WEB_DEVELOPMENT", "GRAPHIC_DESIGN"] } } });
});

describe("qualifyLead", () => {
  it("AUDITED → SCORED, persists the score, writes history and a brief (AC-14.3)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_a", "sig_b"] });
    const result = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(result.status).toBe("SCORED");
    expect(result.band).toBe("QUALIFIED");

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("SCORED");
    expect(lead.score).toBe(70);
    expect(lead.scoreBand).toBe("QUALIFIED");
    expect(lead.scoredAt).not.toBeNull();
    expect(lead.brief).not.toBeNull();
    expect(lead.needsHumanReview).toBe(false);

    const changes = await db.leadEvent.count({ where: { leadId, kind: "SCORE_CHANGE" } });
    expect(changes).toBe(1);
  });

  it("BORDERLINE → SCORED with a ScoreReview, never auto-disqualified (AC-15.1)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_mid"] });
    const result = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(result.status).toBe("SCORED");
    expect(result.band).toBe("BORDERLINE");

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.needsHumanReview).toBe(true);
    const review = await db.scoreReview.findFirst({ where: { leadId } });
    expect(review).not.toBeNull();
    expect(review?.recommendation).toBe("NEEDS_HUMAN");
  });

  it("BELOW → DISQUALIFIED(low_score)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: [] });
    const result = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(result.status).toBe("DISQUALIFIED");
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.disqualifyReason).toBe("low_score");
  });

  it("a matching profile disqualifier → DISQUALIFIED(disqualifier:<id>)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_a", "sig_b"], isActiveClient: true });
    await qualifyLead(leadId, { actor: SYSTEM, clock });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("DISQUALIFIED");
    expect(lead.disqualifyReason).toBe("disqualifier:active_client");
  });

  it("re-scores when new signals arrive (M11-AC8)", async () => {
    const { leadId, companyId } = await makeAuditedLead({ signalTypes: ["sig_mid"] });
    await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).score).toBe(50);

    await withTransaction(async (tx) => {
      await createSignal(tx, { companyId, leadId, serviceLine: "WEB_DEVELOPMENT", signalType: "sig_a" });
      await createSignal(tx, { companyId, leadId, serviceLine: "WEB_DEVELOPMENT", signalType: "sig_b" });
    });
    const result = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(result.score).toBe(100); // 50 + 40 + 30, clamped
    expect(result.band).toBe("QUALIFIED");
    expect(await db.leadEvent.count({ where: { leadId, kind: "SCORE_CHANGE" } })).toBe(2);
  });
});

describe("the borderline review decision", () => {
  it("records a human override and disqualifies (AC-15.2)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_mid"] });
    await qualifyLead(leadId, { actor: SYSTEM, clock });

    await overrideReview(managerActor, leadId, "DISQUALIFY", "A competitor agency.", { clock });

    const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.status).toBe("DISQUALIFIED");
    expect(lead.needsHumanReview).toBe(false);
    const review = await db.scoreReview.findFirstOrThrow({ where: { leadId } });
    expect(review.humanDecision).toBe("DISQUALIFY");
    expect(review.decisionType).toBe("OVERRIDDEN");
    expect(review.overrideNote).toBe("A competitor agency.");
  });
});

describe("cross-sell", () => {
  it("groups two qualified leads, holds the non-leading one (AC-17.1)", async () => {
    const { companyId, webLeadId, gdLeadId } = await withTransaction(async (tx) => {
      const company = await createCompany(tx, { country: "GB", legalForm: "LIMITED" });
      companyIds.push(company.id);
      const web = await createLeadInStatus(tx, "SCORED", { companyId: company.id, serviceLine: "WEB_DEVELOPMENT", market: "INTERNATIONAL", score: 72, scoreBand: "QUALIFIED" });
      const gd = await createLeadInStatus(tx, "SCORED", { companyId: company.id, serviceLine: "GRAPHIC_DESIGN", market: "INTERNATIONAL", score: 65, scoreBand: "QUALIFIED" });
      return { companyId: company.id, webLeadId: web.id, gdLeadId: gd.id };
    });

    const result = await detectCrossSell(companyId, { actor: SYSTEM, clock });
    expect(result.created).toBe(true);
    expect(result.leadingLeadId).toBe(webLeadId);

    const web = await db.lead.findUniqueOrThrow({ where: { id: webLeadId } });
    const gd = await db.lead.findUniqueOrThrow({ where: { id: gdLeadId } });
    expect(web.heldByCrossSell).toBe(false);
    expect(gd.heldByCrossSell).toBe(true);

    const ctx = await getCrossSellContext(gdLeadId);
    expect(ctx.isLeading).toBe(false);
    expect(ctx.leadingLeadId).toBe(webLeadId);
    expect(ctx.lines.sort()).toEqual(["GRAPHIC_DESIGN", "WEB_DEVELOPMENT"]);
  });
});

describe("capacity throttling", () => {
  it("PAUSED holds a qualified lead in NURTURE(CAPACITY); release moves it back to SCORED (AC-18.2/18.4)", async () => {
    // GRAPHIC_DESIGN has no team → capacity 0 → PAUSED.
    const { leadId } = await makeAuditedLead({ line: "GRAPHIC_DESIGN", signalTypes: ["sig_a", "sig_b"] });
    const held = await qualifyLead(leadId, { actor: SYSTEM, clock });
    expect(held.status).toBe("NURTURE");
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).nurtureReason).toBe("CAPACITY");

    // Record the PAUSED state, then give the line capacity and refresh → release.
    await refreshLineCapacity("GRAPHIC_DESIGN", { now: clock.now(), actor: SYSTEM });
    await createMember("SERVICE_LEAD", ["GRAPHIC_DESIGN"], 50);
    const refresh = await refreshLineCapacity("GRAPHIC_DESIGN", { now: clock.now(), actor: SYSTEM });

    expect(refresh.from).toBe("PAUSED");
    expect(refresh.to).toBe("NORMAL");
    expect(refresh.released).toBeGreaterThanOrEqual(1);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe("SCORED");
  });
});

describe("manual lead actions (US-41) and permissions", () => {
  it("a member outside the lead's line can't disqualify it (FORBIDDEN)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_a", "sig_b"] });
    const memberId = await createMember("MEMBER", ["GRAPHIC_DESIGN"]);
    const memberActor: Actor = { type: "USER", userId: memberId, role: "MEMBER" };
    await expect(disqualifyLead(memberActor, leadId, "nope")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("assignLead to a user without the lead's line fails (VALIDATION_FAILED) (AC-41.4)", async () => {
    const { leadId } = await makeAuditedLead({ signalTypes: ["sig_a", "sig_b"] });
    const otherId = await createMember("MEMBER", ["GRAPHIC_DESIGN"]);
    await expect(assignLead(managerActor, leadId, otherId)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
