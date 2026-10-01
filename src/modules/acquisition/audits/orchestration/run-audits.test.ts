/**
 * Integration tests for `runAudits` and the dismiss service (Phase 10). Real test database, mock
 * providers (`MOCKS=true`), registered audit AI tasks. Video and no-website-web leads are used so no
 * network is required; the required-failure case uses a non-resolving `.example` domain.
 */

import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/contracts/common";
import { registerTask } from "@/platform/ai";
import { db, withTransaction } from "@/platform/db";

import { createLeadWithAudit, createProfileVersion, createUser } from "@/tests/factories";
import { auditTasks } from "../tasks";
import { dismissFinding } from "../services";
import { runAudits } from "./run-audits";

const SYSTEM: Actor = { type: "SYSTEM", job: "acquisition.audits.lead" };

// A MANAGER (never an ADMIN) authors the test profiles and dismisses the finding, so this file never
// changes the active-admin count that other integration tests (batch-b1-acceptance) depend on.
let managerId = "";
const markers: string[] = [];

async function seedActiveProfile(serviceLine: "WEB_DEVELOPMENT" | "VIDEO_EDITING"): Promise<void> {
  await db.serviceLineProfileVersion.deleteMany({ where: { serviceLine, note: "test version (audits)" } });
  await db.serviceLineProfileVersion.updateMany({ where: { serviceLine, isActive: true }, data: { isActive: false } });
  await withTransaction((tx) =>
    createProfileVersion(tx, { serviceLine, isActive: true, status: "PUBLISHED", note: "test version (audits)", createdById: managerId }),
  );
}

beforeAll(async () => {
  for (const task of auditTasks) registerTask(task);
  managerId = (await withTransaction((tx) => createUser(tx, { role: "MANAGER" }))).id;
  await seedActiveProfile("VIDEO_EDITING");
  await seedActiveProfile("WEB_DEVELOPMENT");
});

afterAll(async () => {
  await db.serviceLineProfileVersion.deleteMany({ where: { note: "test version (audits)" } });
  await db.teamProfile.deleteMany({ where: { userId: managerId } });
  await db.user.deleteMany({ where: { id: managerId } });
});

afterEach(async () => {
  for (const marker of markers) {
    await db.auditCacheEntry.deleteMany({ where: { cacheKey: { contains: marker } } });
  }
  markers.length = 0;
});

async function cleanup(leadId: string, companyId: string): Promise<void> {
  await db.audit.deleteMany({ where: { leadId } }); // cascades check runs + findings
  await db.leadEvent.deleteMany({ where: { leadId } });
  await db.lead.deleteMany({ where: { id: leadId } });
  await db.company.deleteMany({ where: { id: companyId } });
}

async function makeCompany(data: { socials?: Record<string, string>; website?: string | null; marker: string }): Promise<string> {
  const company = await db.company.create({
    data: {
      name: `Audit Test ${data.marker}`,
      normalizedName: `audit-test-${data.marker}`,
      normalizedDomain: data.website === undefined || data.website === null ? null : `${data.marker}.example`,
      website: data.website ?? null,
      market: "NIGERIA",
      country: "NG",
      firstSource: "test",
      ...(data.socials === undefined ? {} : { socials: data.socials }),
    },
    select: { id: true },
  });
  return company.id;
}

describe("runAudits", () => {
  it("audits a video lead: ENRICHED → AUDITING → AUDITED with findings and audit.completed (AC-12.1)", async () => {
    const marker = randomUUID().slice(0, 8);
    markers.push(marker);
    const companyId = await makeCompany({ marker, socials: { youtube: `https://www.youtube.com/@quiet-${marker}` } });
    const lead = await db.lead.create({
      data: { companyId, serviceLine: "VIDEO_EDITING", market: "NIGERIA", country: "NG", status: "ENRICHED" },
      select: { id: true },
    });
    try {
      const result = await runAudits({ leadId: lead.id, actor: SYSTEM });
      expect(result.finalLeadStatus).toBe("AUDITED");

      const audit = await db.audit.findFirst({ where: { leadId: lead.id, agentId: "audit.video" } });
      expect(audit).not.toBeNull();

      const findings = await db.auditFinding.findMany({ where: { leadId: lead.id } });
      expect(findings.length).toBeGreaterThan(0);
      for (const f of findings) expect(Boolean(f.sourceUrl) || Boolean(f.artifactKey)).toBe(true);

      const leadRow = await db.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { status: true } });
      expect(leadRow.status).toBe("AUDITED");

      const events = await db.leadEvent.findMany({ where: { leadId: lead.id } });
      const toStatuses = events.map((e) => e.toStatus);
      expect(toStatuses).toContain("AUDITING");
      expect(toStatuses).toContain("AUDITED");

      const completed = await db.domainEvent.findFirst({
        where: { name: "audit.completed", payload: { path: ["leadId"], equals: lead.id } },
      });
      expect(completed).not.toBeNull();
    } finally {
      await cleanup(lead.id, companyId);
    }
  }, 30_000);

  it("fires web.no_website HIGH and marks the other website checks NOT_APPLICABLE (AC-12.2)", async () => {
    const marker = randomUUID().slice(0, 8);
    markers.push(marker);
    const companyId = await makeCompany({ marker, website: null, socials: { instagram: `https://instagram.com/${marker}` } });
    const lead = await db.lead.create({
      data: { companyId, serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", country: "NG", status: "ENRICHED" },
      select: { id: true },
    });
    try {
      const result = await runAudits({ leadId: lead.id, actor: SYSTEM });
      expect(result.finalLeadStatus).toBe("AUDITED");

      const finding = await db.auditFinding.findFirst({ where: { leadId: lead.id, checkId: "web.no_website" } });
      expect(finding?.severity).toBe("HIGH");
      expect(finding?.sourceUrl).toContain("instagram.com");

      const pagespeedRun = await db.auditCheckRun.findFirst({ where: { checkId: "web.pagespeed_mobile", audit: { leadId: lead.id } } });
      expect(pagespeedRun?.status).toBe("NOT_APPLICABLE");
    } finally {
      await cleanup(lead.id, companyId);
    }
  }, 30_000);

  it("retries a failing required check and flags the lead after the max (AC-12.4)", async () => {
    const marker = randomUUID().slice(0, 8);
    markers.push(marker);
    // A private-IP website makes the SSRF guard block the required web.mobile_viewport homepage
    // fetch instantly (no DNS), so the required check fails every run.
    const companyId = await makeCompany({ marker, website: "http://127.0.0.1:8080/" });
    const lead = await db.lead.create({
      data: { companyId, serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", country: "NG", status: "ENRICHED" },
      select: { id: true },
    });
    try {
      let finalStatus = "";
      for (let i = 0; i < 3; i += 1) {
        const result = await runAudits({ leadId: lead.id, actor: SYSTEM });
        finalStatus = result.finalLeadStatus;
      }
      expect(finalStatus).toBe("ENRICHED");

      const leadRow = await db.lead.findUniqueOrThrow({
        where: { id: lead.id },
        select: { status: true, auditFailureCount: true, needsAttentionAt: true },
      });
      expect(leadRow.status).toBe("ENRICHED");
      expect(leadRow.auditFailureCount).toBe(3);
      expect(leadRow.needsAttentionAt).not.toBeNull();

      const attention = await db.domainEvent.findFirst({
        where: { name: "lead.needsAttention", payload: { path: ["leadId"], equals: lead.id } },
      });
      expect(attention).not.toBeNull();
    } finally {
      await cleanup(lead.id, companyId);
    }
  }, 45_000);
});

describe("dismissFinding (US-13, INV-18)", () => {
  it("marks a finding dismissed with a reason and audits it", async () => {
    const seeded = await withTransaction((tx) => createLeadWithAudit(tx, { serviceLine: "WEB_DEVELOPMENT" }));
    const manager: Actor = { type: "USER", userId: managerId, role: "MANAGER" };
    try {
      await dismissFinding(manager, seeded.finding.id, "This claim is out of date.");
      const finding = await db.auditFinding.findUniqueOrThrow({ where: { id: seeded.finding.id } });
      expect(finding.dismissedAt).not.toBeNull();
      expect(finding.dismissReason).toBe("This claim is out of date.");
      expect(finding.dismissedById).toBe(managerId);

      const logged = await db.auditLog.findFirst({ where: { action: "acquisition.finding.dismiss", targetId: seeded.finding.id } });
      expect(logged).not.toBeNull();

      const event = await db.domainEvent.findFirst({
        where: { name: "finding.dismissed", payload: { path: ["findingId"], equals: seeded.finding.id } },
      });
      expect(event).not.toBeNull();
    } finally {
      await db.auditFinding.deleteMany({ where: { id: seeded.finding.id } });
      await db.audit.deleteMany({ where: { id: seeded.audit.id } });
      await db.leadEvent.deleteMany({ where: { leadId: seeded.lead.id } });
      await db.lead.deleteMany({ where: { id: seeded.lead.id } });
      await db.company.deleteMany({ where: { id: seeded.lead.companyId } });
      await db.auditLog.deleteMany({ where: { targetId: seeded.finding.id } });
    }
  }, 30_000);
});
