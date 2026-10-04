import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentUser } from "@/platform/auth";
import type * as AuthModule from "@/platform/auth";
import { db } from "@/platform/db";
import { sessionUser } from "@/modules/acquisition/ui/leads/session.test-util";
import { createCompany, createLead, createTeamMember, uniqueToken } from "@/tests/factories";

import { GET } from "./route";

/**
 * The CSV export: who may download it, and that a cell a spreadsheet would run as a formula is
 * exported as text. The session is replaced; the permission matrix, the query and the database
 * are real.
 */

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }));

vi.mock("@/platform/auth", async () => {
  const actual = await vi.importActual<typeof AuthModule>("@/platform/auth");
  return { ...actual, getCurrentUser: () => Promise.resolve(session.user) };
});

let manager: CurrentUser;
let member: CurrentUser;
let ownerId: string;

beforeAll(async () => {
  manager = sessionUser(await createTeamMember(db, { role: "MANAGER", serviceLines: [] }));
  member = sessionUser(
    await createTeamMember(db, { role: "MEMBER", serviceLines: ["WEB_DEVELOPMENT"] }),
  );
  ownerId = (await createTeamMember(db, { role: "MEMBER" })).user.id;
});

beforeEach(() => {
  session.user = null;
});

function exportLeads(slug: string, query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/acquisition/${slug}/leads/export${query}`), {
    params: Promise.resolve({ line: slug }),
  });
}

describe("GET leads export", () => {
  it("answers 401 when nobody is signed in", async () => {
    const response = await exportLeads("web-development");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("answers 403 for a member, who may read leads but not export them", async () => {
    session.user = member;
    const response = await exportLeads("web-development");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("answers 404 for a line that doesn't exist, including an inherited object key", async () => {
    session.user = manager;
    expect((await exportLeads("not-a-line")).status).toBe(404);
    expect((await exportLeads("constructor")).status).toBe(404);
  });

  it("exports the filtered leads as UTF-8 CSV with a header row", async () => {
    const token = uniqueToken();
    const { id: companyId } = await createCompany(db, { name: `Plain Co ${token}` });
    await createLead(db, { companyId, ownerId, serviceLine: "WEB_DEVELOPMENT" });
    session.user = manager;

    const response = await exportLeads("web-development", `?owner=${ownerId}&q=${token}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="leads-web-development-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(response.headers.get("x-export-truncated")).toBe("false");
    const csv = Buffer.from(await response.arrayBuffer()).toString("utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, ...rows] = csv.slice(1).split("\r\n");
    expect(header).toBe(
      "id,company,domain,market,status,score,scoreBand,owner,source,nextActionAt,createdAt",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(`"Plain Co ${token}"`);
  });

  it("exports a formula-looking company name as text, with its quotes doubled", async () => {
    const token = uniqueToken();
    const name = `=HYPERLINK("http://evil.example/${token}","Click")`;
    const { id: companyId } = await createCompany(db, { name });
    await createLead(db, { companyId, ownerId, serviceLine: "WEB_DEVELOPMENT" });
    session.user = manager;

    const response = await exportLeads("web-development", `?owner=${ownerId}&q=${token}`);
    const csv = Buffer.from(await response.arrayBuffer()).toString("utf8");

    // A leading apostrophe makes a spreadsheet show the cell instead of running it.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example/${token}"",""Click"")"`);
    expect(csv).not.toContain(`,=HYPERLINK`);
    expect(csv).not.toContain(`,"=HYPERLINK`);
  });
});
