/**
 * Integration tests for the sourcing runner and services (Phase 8). They run against the real test
 * database with the mock adapters (MOCKS=true), using `spec.sources: ["google-places"]` so no
 * seeded profile is required. Each test starts from a clean slate (sourcing-created rows are purged
 * in beforeEach), and the suite cleans up its users and saved searches at the end.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/contracts/common";
import type { SearchRunCounts, SearchSpec } from "@/contracts/source-adapter";
import { actorOf } from "@/platform/auth";
import { db } from "@/platform/db";
import { createTeamMember } from "@/tests/factories";

import { addManualLead } from "./manual";
import { runSearch } from "./runner";
import { createSavedSearch } from "./saved-search";
import { skipScheduledRunIfAtCapacity } from "./schedules";

// Every test here purges, writes and reads real rows through the adapters, which outgrows the 5s
// default on a loaded machine. A test that times out keeps running, so its writes land in the next
// test's purge and break it on a foreign key; the other integration suites allow 30s for the same
// reason.
vi.setConfig({ testTimeout: 30_000 });

const SRC_FIRST_SOURCES = [
  "google-places",
  "jobs-serpapi",
  "apple-app-store",
  "youtube-channels",
  "csv-import",
  "sourcing-test",
];

async function purge(): Promise<void> {
  const companies = await db.company.findMany({
    where: { OR: [{ firstSource: { in: SRC_FIRST_SOURCES } }, { firstSource: { startsWith: "manual:" } }] },
    select: { id: true },
  });
  const ids = companies.map((c) => c.id);
  await db.signal.deleteMany({ where: { companyId: { in: ids } } });
  await db.lead.deleteMany({ where: { companyId: { in: ids } } });
  await db.companySourceRef.deleteMany({ where: { companyId: { in: ids } } });
  await db.company.deleteMany({ where: { id: { in: ids } } });
  await db.searchRun.deleteMany({
    where: { trigger: { in: ["MANUAL", "SCHEDULED", "CSV_IMPORT", "MANUAL_ADD"] } },
  });
  await db.savedSearch.deleteMany({});
  await db.suppression.deleteMany({ where: { note: "sourcing-test" } });
}

function webSpec(overrides: Partial<SearchSpec> = {}): SearchSpec {
  return {
    serviceLine: "WEB_DEVELOPMENT",
    markets: ["NIGERIA"],
    locations: [{ market: "NIGERIA", text: "Lagos", country: "NG" }],
    keywords: ["restaurants"],
    sources: ["google-places"],
    limit: 50,
    ...overrides,
  };
}

let managerActor: Actor;
let videoActor: Actor;
let managerUserId: string;

beforeAll(async () => {
  // Defensive: remove any users a crashed prior run left behind (they must never persist, since a
  // stray ADMIN would skew the platform's last-active-admin checks in other test files).
  await db.teamProfile.deleteMany({ where: { user: { email: { startsWith: "sourcing-" } } } });
  await db.user.deleteMany({ where: { email: { startsWith: "sourcing-" } } });

  const manager = await createTeamMember(db, {
    role: "MANAGER",
    serviceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "VIDEO_EDITING"],
    user: { email: `sourcing-mgr-${String(Date.now())}@futureuni.test` },
  });
  const video = await createTeamMember(db, {
    role: "SERVICE_LEAD",
    serviceLines: ["VIDEO_EDITING"],
    user: { email: `sourcing-video-${String(Date.now())}@futureuni.test` },
  });
  managerUserId = manager.user.id;
  managerActor = actorOf(manager.user);
  videoActor = actorOf(video.user);
});

beforeEach(purge);

afterAll(async () => {
  await purge();
  const userIds = [managerUserId, videoActor.type === "USER" ? videoActor.userId : ""];
  await db.teamProfile.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
});

function counts(run: { counts: unknown }): SearchRunCounts {
  return run.counts as SearchRunCounts;
}

describe("runSearch", () => {
  it("creates companies, signals and a NEW lead with a LeadEvent (AC-1.2)", async () => {
    const run = await runSearch(webSpec(), { actor: managerActor });
    expect(run.status).toBe("SUCCEEDED");
    const c = counts(run);
    // google-places is a transient source (INV-14): phones aren't stored, so two Google listings
    // with different place_ids can't dedupe within a run (cross-source dedupe by phone/domain
    // happens once a non-transient source supplies them). The GB fixture is out of market.
    expect(c).toMatchObject({
      fetched: 4,
      outOfMarket: 1, // the GB "London Bites" fixture is dropped for a NIGERIA search (AC-1.6)
      suppressed: 0,
      companiesCreated: 3,
      companiesMatched: 0,
      leadsCreated: 3,
      leadsUpdated: 0,
      notReopened: 0,
      errors: 0,
    });

    const signals = await db.signal.findMany({ where: { searchRunId: run.id } });
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.sourceUrl).not.toBeNull();
      expect(s.adapterId).toBe("google-places");
    }
    const leads = await db.lead.findMany({ where: { id: { in: signals.map((s) => s.leadId ?? "") } } });
    expect(leads.every((l) => l.status === "NEW")).toBe(true);
    const creationEvent = await db.leadEvent.findFirst({
      where: { leadId: leads[0]?.id ?? "", fromStatus: null, toStatus: "NEW" },
    });
    expect(creationEvent).not.toBeNull();
  });

  it("creates no duplicates on a re-run, only matches (AC-1.3)", async () => {
    await runSearch(webSpec(), { actor: managerActor });
    const leadsAfterFirst = await db.lead.count();
    const second = await runSearch(webSpec(), { actor: managerActor });
    const c = counts(second);
    expect(c.companiesCreated).toBe(0);
    expect(c.companiesMatched).toBeGreaterThan(0);
    expect(c.leadsCreated).toBe(0);
    expect(await db.lead.count()).toBe(leadsAfterFirst);
  });

  it("never creates a lead for a suppressed contact (AC-9.x, INV-2)", async () => {
    await db.suppression.create({
      data: { type: "PHONE", value: "+2348031234567", reason: "UNSUBSCRIBE", source: "REPLY", note: "sourcing-test" },
    });
    const run = await runSearch(webSpec(), { actor: managerActor });
    expect(counts(run).suppressed).toBeGreaterThanOrEqual(1);
    const mamaPut = await db.company.findFirst({ where: { phones: { has: "+2348031234567" } } });
    expect(mamaPut).toBeNull();
  });

  it("doesn't reopen a disqualified lead for the line (source-adapter.md rule 8)", async () => {
    const company = await db.company.create({
      data: {
        name: "Existing Lagos Co",
        normalizedName: "existing lagos co",
        market: "NIGERIA",
        country: "NG",
        phones: ["+2348031234567"],
        primaryPhone: "+2348031234567",
        firstSource: "sourcing-test",
      },
      select: { id: true },
    });
    await db.lead.create({
      data: { companyId: company.id, serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", status: "DISQUALIFIED" },
    });
    const run = await runSearch(webSpec(), { actor: managerActor });
    expect(counts(run).notReopened).toBeGreaterThanOrEqual(1);
    const open = await db.lead.findFirst({
      where: { companyId: company.id, serviceLine: "WEB_DEVELOPMENT", status: { notIn: ["DISQUALIFIED", "WON", "LOST", "SUPPRESSED"] } },
    });
    expect(open).toBeNull();
  });

  it("records a cross-line hint when an open lead exists on another line (Phase 11 cross-sell)", async () => {
    const company = await db.company.create({
      data: {
        name: "Cross Lagos Co",
        normalizedName: "cross lagos co",
        market: "NIGERIA",
        country: "NG",
        phones: ["+2348031234567"],
        primaryPhone: "+2348031234567",
        firstSource: "sourcing-test",
      },
      select: { id: true },
    });
    await db.lead.create({
      data: { companyId: company.id, serviceLine: "VIDEO_EDITING", market: "NIGERIA", status: "SCORED" },
    });
    const run = await runSearch(webSpec(), { actor: managerActor });
    const signal = await db.signal.findFirst({
      where: { searchRunId: run.id, companyId: company.id },
    });
    expect(signal).not.toBeNull();
    expect((signal?.crossLineHint as { otherServiceLine?: string } | null)?.otherServiceLine).toBe("VIDEO_EDITING");
  });

  it("finishes PARTIAL when an adapter fails, recording the error (AC-3.2)", async () => {
    const run = await runSearch(webSpec({ keywords: ["force-adapter-error"] }), { actor: managerActor });
    expect(run.status).toBe("PARTIAL");
    const perSource = run.perSource as { status: string; error?: string }[];
    expect(perSource[0]?.status).toBe("FAILED");
    expect(perSource[0]?.error).toBeTruthy();
  });

  it("refuses a search for a line the actor doesn't own, creating no SearchRun (AC-1.4)", async () => {
    const before = await db.searchRun.count();
    await expect(runSearch(webSpec(), { actor: videoActor })).rejects.toThrow();
    expect(await db.searchRun.count()).toBe(before);
  });
});

describe("addManualLead", () => {
  it("adds one company and a NEW lead owned by the creator, source manual:<userId>", async () => {
    const run = await addManualLead(managerActor, {
      serviceLine: "WEB_DEVELOPMENT",
      company: { name: "Warri Foods", phone: "+2348090000099", city: "Warri", country: "NG" },
      signalTypes: [],
    });
    expect(run.searchRun.trigger).toBe("MANUAL_ADD");
    const signal = await db.signal.findFirst({ where: { searchRunId: run.searchRun.id } });
    expect(signal?.adapterId).toBe("manual");
    expect(signal?.sourceUrl).toBeNull();
    const lead = await db.lead.findFirst({ where: { id: signal?.leadId ?? "" } });
    expect(lead?.status).toBe("NEW");
    expect(lead?.ownerId).toBe(managerUserId);
  });

  it("doesn't add a lead for a suppressed phone (AC-6.2)", async () => {
    await db.suppression.create({
      data: { type: "PHONE", value: "+2348090000077", reason: "UNSUBSCRIBE", source: "REPLY", note: "sourcing-test" },
    });
    const run = await addManualLead(managerActor, {
      serviceLine: "WEB_DEVELOPMENT",
      company: { name: "Suppressed Co", phone: "+2348090000077", country: "NG" },
    });
    expect(counts(run.searchRun).suppressed).toBe(1);
    expect(counts(run.searchRun).leadsCreated).toBe(0);
  });
});

describe("scheduled search capacity skip", () => {
  it("skips and records a SKIPPED run when the line is at capacity (AC-4.3)", async () => {
    // GRAPHIC_DESIGN has no team members in this suite, so it is at capacity (available <= 0).
    const saved = await createSavedSearch(managerActor, {
      name: "Graphic nightly",
      spec: {
        serviceLine: "GRAPHIC_DESIGN",
        markets: ["NIGERIA"],
        locations: [{ market: "NIGERIA", text: "Lagos", country: "NG" }],
        keywords: ["logos"],
        limit: 20,
      },
      cron: "0 9 * * *",
    });
    const skipped = await skipScheduledRunIfAtCapacity({
      savedSearchId: saved.id,
      spec: saved.spec as { serviceLine: "GRAPHIC_DESIGN"; markets: ["NIGERIA"] },
      actor: { type: "SYSTEM", job: "acquisition.sourcing.run" },
      clock: { now: () => new Date() },
    });
    expect(skipped).toBe(true);
    const skippedRun = await db.searchRun.findFirst({
      where: { savedSearchId: saved.id, status: "SKIPPED", skipReason: "capacity" },
    });
    expect(skippedRun).not.toBeNull();
  });
});
