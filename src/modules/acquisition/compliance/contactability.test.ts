import { describe, expect, it } from "vitest";

import { withRollback, createCompany, createContact } from "@/tests/factories";

import { getContactability, assertEmailAllowed } from "./contactability";
import { addSuppression } from "./suppression";

describe("contactability", () => {
  it("UK limited company → email ALLOWED", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "GB", legalForm: "LIMITED" });
      const contact = await createContact(tx, { companyId: company.id, email: `owner-${String(Date.now())}@example.co.uk` });
      const verdict = await getContactability(tx, { companyId: company.id, contactId: contact.id });
      expect(verdict.email.status).toBe("ALLOWED");
    });
  });

  it("UK sole trader → CONSENT_REQUIRED (INV-6)", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "GB", legalForm: "SOLE_TRADER" });
      const contact = await createContact(tx, { companyId: company.id });
      const verdict = await getContactability(tx, { companyId: company.id, contactId: contact.id });
      expect(verdict.email.status).toBe("CONSENT_REQUIRED");
    });
  });

  it("UK unknown legal form → REVIEW", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "GB", legalForm: "UNKNOWN" });
      const contact = await createContact(tx, { companyId: company.id });
      const verdict = await getContactability(tx, { companyId: company.id, contactId: contact.id });
      expect(verdict.email.status).toBe("REVIEW");
    });
  });

  it("Nigeria default (pending review) → REVIEW", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "NG", legalForm: "NG_REGISTERED_COMPANY" });
      const contact = await createContact(tx, { companyId: company.id });
      const verdict = await getContactability(tx, { companyId: company.id, contactId: contact.id });
      expect(verdict.email.status).toBe("REVIEW");
      expect(verdict.email.ruleId).toBe("NG.pending_legal_review");
    });
  });

  it("unknown country → REVIEW", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "XX", legalForm: "UNKNOWN" });
      const contact = await createContact(tx, { companyId: company.id });
      const verdict = await getContactability(tx, { companyId: company.id, contactId: contact.id });
      expect(verdict.email.status).toBe("REVIEW");
    });
  });

  it("assertEmailAllowed throws CONTACT_BLOCKED on non-ALLOWED", async () => {
    await withRollback(async (tx) => {
      const company = await createCompany(tx, { country: "GB", legalForm: "UNKNOWN" });
      const contact = await createContact(tx, { companyId: company.id });
      await expect(assertEmailAllowed(tx, { companyId: company.id, contactId: contact.id })).rejects.toMatchObject({
        code: "CONTACT_BLOCKED",
      });
    });
  });

  it("adding a suppression cascades: company match blocks contactability", async () => {
    const { db } = await import("@/platform/db");
    const admin = await db.user.create({
      data: {
        email: `p9-admin-${String(Date.now())}@example.com`,
        name: "P9 Admin",
        role: "ADMIN",
        status: "ACTIVE",
        emailVerified: true,
      } as never,
      select: { id: true },
    });
    const company = await db.company.create({
      data: {
        name: "Test Cascade",
        normalizedName: "test-cascade",
        normalizedDomain: `cascade${String(Date.now())}.example`,
        market: "INTERNATIONAL",
        firstSource: "test",
      },
      select: { id: true, normalizedDomain: true },
    });
    try {
      await addSuppression(
        { type: "USER", userId: admin.id, role: "ADMIN" },
        { type: "DOMAIN", value: company.normalizedDomain ?? "", reason: "MANUAL", source: "MANUAL" },
      );
      const verdict = await getContactability(null, { companyId: company.id });
      expect(verdict.email.status).toBe("BLOCKED");
    } finally {
      await db.suppression.deleteMany({ where: { type: "DOMAIN", value: company.normalizedDomain ?? "" } });
      await db.company.delete({ where: { id: company.id } });
      await db.user.delete({ where: { id: admin.id } });
    }
  });
});
