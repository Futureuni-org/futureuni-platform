import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/platform/db";
import { createCompany, createLead, createTeamMember, uniqueToken } from "@/tests/factories";

import { parseLeadFilters } from "./lead-filters";
import { listLeads } from "./leads-list.repo";

/**
 * The leads list query against a real database: the search box matches its text literally, and a
 * day range covers whole days in the viewer's timezone. Every test filters by an owner of its own,
 * so rows left by other tests never count.
 */

const LAGOS = "Africa/Lagos"; // UTC+1

let ownerId: string;

beforeAll(async () => {
  ownerId = (await createTeamMember(db, { role: "MEMBER" })).user.id;
});

async function leadFor(company: string, overrides: Parameters<typeof createLead>[1] = {}) {
  const { id: companyId } = await createCompany(db, { name: company });
  return createLead(db, { companyId, ownerId, serviceLine: "WEB_DEVELOPMENT", ...overrides });
}

async function names(params: Record<string, string>): Promise<string[]> {
  const page = await listLeads({
    serviceLine: "WEB_DEVELOPMENT",
    filter: parseLeadFilters({ owner: ownerId, ...params }, LAGOS),
    limit: 100,
  });
  return page.items.map((row) => row.companyName).sort();
}

describe("search", () => {
  it("treats % and _ as the characters typed, not as wildcards", async () => {
    const token = uniqueToken();
    await leadFor(`100% Organic ${token}`);
    await leadFor(`Plain Foods ${token}`);
    await leadFor(`A_B Studio ${token}`);
    await leadFor(`AxB Studio ${token}`);

    // As a wildcard, "%" would match every lead and "A_B" would match "AxB" too.
    expect(await names({ q: "%" })).toEqual([`100% Organic ${token}`]);
    expect(await names({ q: "a_b" })).toEqual([`A_B Studio ${token}`]);
    expect(await names({ q: token })).toHaveLength(4);
  });

  it("matches without regard to case", async () => {
    const token = uniqueToken();
    await leadFor(`Zebra Crossing ${token}`);
    expect(await names({ q: `zebra crossing ${token}`.toUpperCase() })).toEqual([
      `Zebra Crossing ${token}`,
    ]);
  });
});

describe("date range", () => {
  it("covers the whole of the last day, in the viewer's timezone", async () => {
    const token = uniqueToken();
    // 23:30 on 3 Oct in Lagos. A range ending at 00:00 on the 3rd would have dropped it.
    await leadFor(`Late evening ${token}`, { createdAt: new Date("2026-10-03T22:30:00Z") });
    // 00:30 on 4 Oct in Lagos, although still 3 Oct in UTC.
    await leadFor(`Next morning ${token}`, { createdAt: new Date("2026-10-03T23:30:00Z") });
    // 23:30 on 2 Oct in Lagos.
    await leadFor(`Day before ${token}`, { createdAt: new Date("2026-10-02T22:30:00Z") });

    expect(await names({ q: token, from: "2026-10-03", to: "2026-10-03" })).toEqual([
      `Late evening ${token}`,
    ]);
    expect(await names({ q: token, from: "2026-10-04" })).toEqual([`Next morning ${token}`]);
    expect(await names({ q: token, to: "2026-10-02" })).toEqual([`Day before ${token}`]);
  });

  it("filters by last activity when asked, not by when the row was touched", async () => {
    const token = uniqueToken();
    await leadFor(`Active ${token}`, { lastActivityAt: new Date("2026-10-03T10:00:00Z") });
    await leadFor(`Quiet ${token}`, { lastActivityAt: new Date("2026-08-01T10:00:00Z") });

    expect(await names({ q: token, dateField: "activity", from: "2026-10-01" })).toEqual([
      `Active ${token}`,
    ]);
  });
});
