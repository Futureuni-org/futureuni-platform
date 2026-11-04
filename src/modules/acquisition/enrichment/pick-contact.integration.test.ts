import { describe, expect, it } from "vitest";

import type { Actor } from "@/contracts/common";
import { db } from "@/platform/db";
import { createCompany, createContact, createLead } from "../../../../tests/factories";

import { ensurePrimaryContact, pickDeterministic } from "./pick-contact";

const ACTOR: Actor = { type: "SYSTEM", job: "acquisition.lead.advance" };

describe("pickDeterministic", () => {
  it("prefers verified personal addresses over unverified role addresses", () => {
    const role = { emailStatus: "UNVERIFIED", emailType: "ROLE" as const };
    const personal = { emailStatus: "VALID", emailType: "PERSONAL" as const };
    expect(pickDeterministic([role, personal])).toBe(personal);
    expect(pickDeterministic([personal, role])).toBe(personal);
  });

  it("returns null for no candidates", () => {
    expect(pickDeterministic([])).toBeNull();
  });
});

describe("ensurePrimaryContact", () => {
  it("returns null when the company has no emailable contact", async () => {
    const lead = await createLead(db, { status: "ENRICHED" });
    expect(await ensurePrimaryContact(lead.id, ACTOR)).toBeNull();
  });

  it("sets the single emailable contact as primary", async () => {
    const company = await createCompany(db);
    const contact = await createContact(db, { companyId: company.id });
    const lead = await createLead(db, { companyId: company.id, status: "ENRICHED" });

    expect(await ensurePrimaryContact(lead.id, ACTOR)).toBe(contact.id);
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.primaryContactId).toBe(contact.id);
  });

  it("leaves an already-set primary contact alone", async () => {
    const company = await createCompany(db);
    const first = await createContact(db, { companyId: company.id });
    await createContact(db, { companyId: company.id });
    const lead = await createLead(db, {
      companyId: company.id,
      status: "ENRICHED",
      primaryContactId: first.id,
    });

    expect(await ensurePrimaryContact(lead.id, ACTOR)).toBe(first.id);
  });

  it("picks among several candidates, skipping INVALID emails", async () => {
    const company = await createCompany(db);
    await createContact(db, { companyId: company.id, emailStatus: "INVALID" });
    const role = await createContact(db, {
      companyId: company.id,
      emailStatus: "UNVERIFIED",
      emailType: "ROLE",
    });
    const personal = await createContact(db, {
      companyId: company.id,
      emailStatus: "VALID",
      emailType: "PERSONAL",
    });
    const lead = await createLead(db, { companyId: company.id, status: "ENRICHED" });

    const chosen = await ensurePrimaryContact(lead.id, ACTOR);
    expect([role.id, personal.id]).toContain(chosen);
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.primaryContactId).toBe(chosen);
  });
});
