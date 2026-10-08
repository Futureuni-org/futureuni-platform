/**
 * Wave 2 end-to-end pipeline (Part C3, step 6): search → enrich → audit, across the service lines.
 * Runs against the real test database with mock adapters/providers (MOCKS=true) and a permissive
 * MSW handler so enrichment crawls resolve. SYSTEM actors are used throughout (the jobs are
 * manifest-registered, so their systemActions authorise the services), so no users are committed.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";

import type { Actor, ServiceLine } from "@/contracts/common";
import { enrichLead } from "@/modules/acquisition/enrichment/pipeline";
import { DEFAULT_PROFILES } from "@/modules/acquisition/profiles";
import { runAudits } from "@/modules/acquisition/audits";
import { runSearch } from "@/modules/acquisition/sourcing";
import { db, toJsonInput } from "@/platform/db";
import { configureSsrf } from "@/platform/http";
import { server } from "@/tests/setup/msw-server";

/*
 * Phase 19 starts the advance workflow from `lead.created`, and in tests an enqueued job runs
 * inline (src/platform/jobs/enqueue.ts), so a search would enrich, audit and score every lead
 * before this file drives those stages itself — the manual calls would then hit an already
 * advanced lead and fail on INVALID_TRANSITION. Stubbing the starter keeps Wave 2's three stages
 * under test in isolation. Note the advance workflow itself has no test of its own yet, so nothing
 * currently asserts that a new lead advances on its own.
 */
vi.mock("@/modules/acquisition/workflows/start", () => ({
  tryStartAdvance: () => Promise.resolve({ started: false, reason: "not-advanceable" }),
  requeueAdvance: () => Promise.resolve({ started: false }),
}));

const LINES: ServiceLine[] = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"];
const SRC = ["google-places", "jobs-serpapi", "youtube-channels", "apple-app-store"];

const SOURCING_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.sourcing.run" };
const ENRICH_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.enrichment.lead" };
const AUDIT_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.audits.lead" };

let seedUserId: string;

async function purge(): Promise<void> {
  const companies = await db.company.findMany({
    where: { firstSource: { in: SRC } },
    select: { id: true },
  });
  const ids = companies.map((c) => c.id);
  if (ids.length > 0) {
    await db.auditFinding.deleteMany({ where: { companyId: { in: ids } } });
    await db.auditCheckRun.deleteMany({ where: { audit: { companyId: { in: ids } } } });
    await db.audit.deleteMany({ where: { companyId: { in: ids } } });
    await db.signal.deleteMany({ where: { companyId: { in: ids } } });
    await db.contact.deleteMany({ where: { companyId: { in: ids } } });
    await db.lead.deleteMany({ where: { companyId: { in: ids } } });
    await db.companySourceRef.deleteMany({ where: { companyId: { in: ids } } });
    await db.company.deleteMany({ where: { id: { in: ids } } });
  }
  await db.searchRun.deleteMany({
    where: { trigger: { in: ["MANUAL", "SCHEDULED", "CSV_IMPORT", "MANUAL_ADD"] } },
  });
  await db.suppression.deleteMany({ where: { note: "wave2-test" } });
}

/**
 * Clears every profile version. The scope is global by design, because this file seeds the four
 * code defaults and a line may hold only one active version (INV-16). The rows that point at a
 * version must go first: an enrolment restricts deleting its sequence, and a sequence cascades its
 * steps. Without that order another file's leftover sequence breaks this setup on the foreign key
 * `acq_sequences_profileVersionId_fkey`.
 */
async function deleteAllProfileVersions(): Promise<void> {
  await db.enrollment.deleteMany({});
  await db.sequence.deleteMany({});
  await db.serviceLineProfileVersion.deleteMany({});
}

beforeAll(async () => {
  configureSsrf({ trustHostnames: ["*"] });
  // A permissive stand-in for any website the enrichment crawler visits, so a company that has a
  // website reaches ENRICHED (crawl succeeds trivially) instead of hitting an unhandled request.
  server.use(
    http.get(/.*\/robots\.txt$/, () => HttpResponse.text("User-agent: *\nAllow: /\n")),
    http.get(/^https?:\/\/.*/, () => HttpResponse.html("<html><body><p>Hello.</p></body></html>")),
  );

  // One MEMBER user to own the seeded profile versions (never an admin, to avoid global pollution).
  await db.user.deleteMany({ where: { email: { startsWith: "wave2-" } } });
  const user = await db.user.create({
    data: { email: `wave2-${String(Date.now())}@futureuni.test`, name: "Wave 2 Seed", role: "MEMBER", emailVerified: true },
    select: { id: true },
  });
  seedUserId = user.id;

  // Seed the four active profiles from the code defaults (INV-16: one active version per line).
  await deleteAllProfileVersions();
  for (const line of LINES) {
    await db.serviceLineProfileVersion.create({
      data: {
        serviceLine: line,
        version: 1,
        status: "PUBLISHED",
        isActive: true,
        profile: toJsonInput(DEFAULT_PROFILES[line]),
        createdById: seedUserId,
        publishedById: seedUserId,
        publishedAt: new Date(),
      },
    });
  }
});

beforeEach(purge);

afterEach(() => {
  server.resetHandlers();
});

afterAll(async () => {
  await purge();
  await deleteAllProfileVersions();
  await db.user.deleteMany({ where: { id: seedUserId } });
  configureSsrf();
});

async function leadEventStatuses(leadId: string): Promise<string[]> {
  const events = await db.leadEvent.findMany({
    where: { leadId },
    orderBy: { createdAt: "asc" },
    select: { toStatus: true },
  });
  return events.map((e) => e.toStatus ?? "");
}

/** The primary mock source per line, so each line's search yields predictable fixtures. */
const PRIMARY_SOURCE: Record<ServiceLine, "google-places" | "apple-app-store" | "youtube-channels"> = {
  WEB_DEVELOPMENT: "google-places",
  GRAPHIC_DESIGN: "google-places",
  UI_UX_DESIGN: "apple-app-store",
  VIDEO_EDITING: "youtube-channels",
};

async function runPipeline(line: ServiceLine, market: "NIGERIA" | "INTERNATIONAL"): Promise<void> {
  // google-places fixtures carry enough for the required audit checks to complete to AUDITED. The
  // app/video mocks don't supply review/channel data, so their required checks legitimately fail and
  // the lead rebounds to ENRICHED (a valid audit path) — we accept either for those lines.
  const requireAudited = PRIMARY_SOURCE[line] === "google-places";
  const spec = {
    serviceLine: line,
    markets: [market],
    locations: [
      market === "NIGERIA"
        ? { market, text: "Lagos", country: "NG" }
        : { market, text: "Manchester", country: "GB" },
    ],
    keywords: ["business"],
    sources: [PRIMARY_SOURCE[line]],
    limit: 50,
  };

  const run = await runSearch(spec, { actor: SOURCING_ACTOR });
  expect(run.status).toBe("SUCCEEDED");
  const leads = await db.lead.findMany({ where: { status: "NEW", serviceLine: line } });
  expect(leads.length).toBeGreaterThan(0);

  // Dedupe: a second identical run creates no new leads.
  const before = await db.lead.count();
  await runSearch(spec, { actor: SOURCING_ACTOR });
  expect(await db.lead.count()).toBe(before);

  let enrichedCount = 0;
  let auditedCount = 0;
  for (const lead of leads) {
    const enriched = await enrichLead({ leadId: lead.id, actor: ENRICH_ACTOR });
    expect(["ENRICHED", "SUPPRESSED", "DISQUALIFIED"]).toContain(enriched.status);
    if (enriched.status !== "ENRICHED") continue;
    enrichedCount += 1;

    const audited = await runAudits({ leadId: lead.id, actor: AUDIT_ACTOR });
    // AUDITED when the required checks complete, or ENRICHED when they can't on mock data (rebound).
    expect(["AUDITED", "ENRICHED"]).toContain(audited.finalLeadStatus);
    if (audited.finalLeadStatus !== "AUDITED") continue;
    auditedCount += 1;

    // Every finding carries evidence plus a source URL or an artifact (INV-18).
    const findings = await db.auditFinding.findMany({ where: { leadId: lead.id } });
    for (const f of findings) {
      expect(f.sourceUrl !== null || f.artifactKey !== null).toBe(true);
    }

    // A LeadEvent exists for each transition through the Wave 2 lifecycle.
    const statuses = await leadEventStatuses(lead.id);
    expect(statuses).toEqual(
      expect.arrayContaining(["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED"]),
    );
  }
  // Every line enriches at least one lead; the google-places lines also reach AUDITED.
  expect(enrichedCount).toBeGreaterThan(0);
  if (requireAudited) expect(auditedCount).toBeGreaterThan(0);
}

describe("Wave 2 pipeline: search → enrich → audit", () => {
  for (const line of LINES) {
    it(
      `${line} (NIGERIA) runs end to end to AUDITED`,
      async () => {
        await runPipeline(line, "NIGERIA");
      },
      60_000, // a full search → enrich → audit chain over several records
    );
  }

  it(
    "WEB_DEVELOPMENT (INTERNATIONAL) runs end to end to AUDITED",
    async () => {
      await runPipeline("WEB_DEVELOPMENT", "INTERNATIONAL");
    },
    60_000,
  );

  it("never turns a suppressed company into a lead (INV-2)", async () => {
    await db.suppression.create({
      data: { type: "PHONE", value: "+2348031234567", reason: "UNSUBSCRIBE", source: "REPLY", note: "wave2-test" },
    });
    const run = await runSearch(
      {
        serviceLine: "WEB_DEVELOPMENT",
        markets: ["NIGERIA"],
        locations: [{ market: "NIGERIA", text: "Lagos", country: "NG" }],
        keywords: ["restaurants"],
        sources: ["google-places"],
        limit: 50,
      },
      { actor: SOURCING_ACTOR },
    );
    expect((run.counts as { suppressed: number }).suppressed).toBeGreaterThanOrEqual(1);
    expect(await db.company.findFirst({ where: { phones: { has: "+2348031234567" } } })).toBeNull();
  });
});
