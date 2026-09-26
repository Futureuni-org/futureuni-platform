import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { db, withTransaction } from "@/platform/db";
import { withRollback } from "../../../tests/factories/test-db";

import { upsertCompany, upsertContact } from "./upsert";

const clock = { now: () => new Date("2026-10-03T09:00:00.000Z") };

describe("upsertCompany", () => {
  it("creates a company with its source, collection time and lawful basis (INV-10)", () =>
    withRollback(async (tx) => {
      const { record, created, matchedBy } = await upsertCompany(
        tx,
        {
          name: "Adunni Bakes & Events Ltd",
          website: "https://www.adunnibakes.example/menu",
          phones: ["0803 123 4567"],
          country: "ng",
          city: "Lagos",
        },
        { id: "csv-import", url: "https://adunnibakes.example/contact" },
        { clock },
      );
      expect(created).toBe(true);
      expect(matchedBy).toBeNull();
      expect(record).toMatchObject({
        name: "Adunni Bakes & Events Ltd",
        normalizedName: "adunni bakes and events",
        normalizedDomain: "adunnibakes.example",
        websiteKind: "OWN_SITE",
        phones: ["+2348031234567"],
        primaryPhone: "+2348031234567",
        country: "NG",
        market: "NIGERIA",
        firstSource: "csv-import",
        firstSourceUrl: "https://adunnibakes.example/contact",
        lawfulBasis: "LEGITIMATE_INTEREST_B2B",
      });
      expect(record.collectedAt.toISOString()).toBe("2026-10-03T09:00:00.000Z");
      expect(record.fieldSources).toMatchObject({
        website: { source: "csv-import", collectedAt: "2026-10-03T09:00:00.000Z", verified: false },
      });
    }));

  it("records an Instagram-only business as SOCIAL_ONLY with no domain", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        {
          name: "Warri Smiles Clinic",
          website: "https://instagram.com/warrismiles",
          country: "NG",
          city: "Warri",
        },
        { id: "manual:cm1user00000000000000000001" },
      );
      expect(record).toMatchObject({ websiteKind: "SOCIAL_ONLY", normalizedDomain: null });
    }));

  it("merges new non-empty fields into a match and unions phones", () =>
    withRollback(async (tx) => {
      const first = await upsertCompany(
        tx,
        {
          name: "Thames Dental",
          website: "thamesdental.example",
          phones: ["020 7946 0018"],
          country: "GB",
        },
        { id: "google-places-free-listing" },
      );
      const second = await upsertCompany(
        tx,
        {
          name: "Thames Dental Care Ltd",
          website: "https://www.thamesdental.example",
          phones: ["+44 20 7946 0099"],
          city: "London",
          postcode: "SE1 7PB",
        },
        { id: "crawl" },
      );
      expect(second.created).toBe(false);
      expect(second.matchedBy).toBe("domain");
      expect(second.record.id).toBe(first.record.id);
      expect(second.record).toMatchObject({
        name: "Thames Dental", // kept: the new name isn't verified
        city: "London", // filled
        postcode: "SE1 7PB",
        phones: ["+442079460018", "+442079460099"],
      });
    }));

  it("never overwrites verified data with unverified data, and lets verified data replace unverified", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        {
          name: "Northwind Ltd",
          website: "northwind.example",
          country: "GB",
          legalForm: "SOLE_TRADER",
        },
        { id: "crawl" },
      );
      const verified = await upsertCompany(
        tx,
        {
          name: "Northwind Ltd",
          website: "northwind.example",
          legalForm: "LIMITED",
          companyNumber: "01234567",
        },
        { id: "companies-house", verified: true },
      );
      expect(verified.record).toMatchObject({
        id: record.id,
        legalForm: "LIMITED",
        companyNumber: "01234567",
      });
      const unverified = await upsertCompany(
        tx,
        { name: "Northwind Ltd", website: "northwind.example", legalForm: "PARTNERSHIP" },
        { id: "crawl" },
      );
      expect(unverified.record.legalForm).toBe("LIMITED");
    }));

  it("lets an own website replace a social link", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        {
          name: "Lekki Threads",
          website: "https://instagram.com/lekkithreads",
          country: "NG",
          city: "Lekki",
        },
        { id: "manual:cm1user00000000000000000001" },
      );
      const later = await upsertCompany(
        tx,
        { name: "Lekki Threads", website: "https://lekkithreads.example", city: "Lekki" },
        { id: "crawl" },
      );
      expect(later.record).toMatchObject({
        id: record.id,
        websiteKind: "OWN_SITE",
        normalizedDomain: "lekkithreads.example",
      });
    }));

  it("never replaces an own website with a social link, even from a verified source", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Own Site Co", website: "https://ownsite.example", country: "NG", city: "Lagos" },
        { id: "crawl" },
      );
      const { record: after } = await upsertCompany(
        tx,
        {
          name: "Own Site Co",
          website: "https://instagram.com/ownsite",
          country: "NG",
          city: "Lagos",
        },
        { id: "manual:cm1user0000000000000000001", verified: true },
      );
      expect(after.id).toBe(record.id);
      expect(after).toMatchObject({ website: "https://ownsite.example", websiteKind: "OWN_SITE" });
    }));

  it("reads national phone numbers with the company's country when the candidate has none", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Phone Co", website: "https://phoneco.example", country: "NG" },
        { id: "crawl" },
      );
      const { record: after } = await upsertCompany(
        tx,
        { name: "Phone Co", website: "https://phoneco.example", phones: ["0803 555 0101"] },
        { id: "crawl" },
      );
      expect(after.id).toBe(record.id);
      expect(after.phones).toEqual(["+2348035550101"]);
    }));

  it("keeps the valid provenance entries when one is malformed", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Provenance Co", website: "https://provenance.example", country: "NG" },
        { id: "companies-house", verified: true },
      );
      await tx.company.update({
        where: { id: record.id },
        data: { fieldSources: { ...(record.fieldSources as object), broken: { nope: true } } },
      });
      const { record: after } = await upsertCompany(
        tx,
        { name: "Unverified Name Ltd", website: "https://provenance.example" },
        { id: "crawl" },
      );
      // The verified name survives: its provenance entry was kept.
      expect(after.name).toBe("Provenance Co");
    }));

  it("keeps only the place_id from Google Places (INV-14), under a placeholder name", () =>
    withRollback(async (tx) => {
      const placeId = "ChIJ000000000000000abc123";
      const { record } = await upsertCompany(
        tx,
        {
          name: "Mama Put Kitchen",
          website: "https://mamaput.example",
          phones: ["0803 123 4567"],
          addressLine: "12 Admiralty Way",
          country: "NG",
          city: "Lekki",
          searchLocation: { city: "Lagos", region: "Lagos" },
          industry: "restaurant",
          externalRef: {
            adapterId: "google-places",
            externalId: placeId,
            url: "https://maps.google.com/?cid=1",
          },
        },
        { id: "google-places", url: "https://maps.google.com/?cid=1" },
      );
      expect(record).toMatchObject({
        name: "Place abc123",
        website: null,
        normalizedDomain: null,
        phones: [],
        primaryPhone: null,
        addressLine: null,
        // The search's location (ours), not the listing's city (Google's).
        city: "Lagos",
        region: "Lagos",
        industry: "restaurant",
        firstSource: "google-places",
      });
      const ref = await tx.companySourceRef.findUniqueOrThrow({
        where: { adapterId_externalId: { adapterId: "google-places", externalId: placeId } },
      });
      expect(ref.companyId).toBe(record.id);

      // Enrichment later finds the real name on the business's own website: it replaces the placeholder.
      const enriched = await upsertCompany(
        tx,
        {
          name: "Mama Put Kitchen Ltd",
          website: "https://mamaput.example",
          externalRef: { adapterId: "google-places", externalId: placeId },
        },
        { id: "crawl", url: "https://mamaput.example" },
      );
      expect(enriched.record).toMatchObject({
        id: record.id,
        name: "Mama Put Kitchen Ltd",
        normalizedDomain: "mamaput.example",
      });
    }));

  it("refuses a company with no country or market, and a Places company without its place_id", () =>
    withRollback(async (tx) => {
      await expect(
        upsertCompany(tx, { name: "Nowhere Ltd" }, { id: "crawl" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      await expect(
        upsertCompany(tx, { name: "No Ref", country: "NG" }, { id: "google-places" }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }));

  it("merges into the winner when two transactions create the same domain at once", async () => {
    const domain = `race-${randomUUID().slice(0, 8)}.example`;
    const candidate = { name: "Race Ltd", website: `https://${domain}`, country: "GB" };
    try {
      const results = await Promise.all([
        withTransaction((tx) => upsertCompany(tx, candidate, { id: "crawl" })),
        withTransaction((tx) =>
          upsertCompany(tx, { ...candidate, city: "Leeds" }, { id: "crawl" }),
        ),
      ]);
      expect(results.map((result) => result.record.id)).toEqual([
        results[0].record.id,
        results[0].record.id,
      ]);
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(await db.company.count({ where: { normalizedDomain: domain } })).toBe(1);
    } finally {
      await db.company.deleteMany({ where: { normalizedDomain: domain } });
    }
  });
});

describe("upsertContact", () => {
  it("creates a contact with provenance and matches it again by email, case-insensitively", () =>
    withRollback(async (tx) => {
      const { record: company } = await upsertCompany(
        tx,
        { name: "Contact Co", country: "GB" },
        { id: "crawl" },
      );
      const first = await upsertContact(
        tx,
        company.id,
        {
          name: "Sam Carter",
          email: "Sam.Carter@ContactCo.example",
          role: "Owner",
          seniority: "OWNER",
        },
        { id: "crawl", url: "https://contactco.example/team" },
        { clock },
      );
      expect(first.created).toBe(true);
      expect(first.record).toMatchObject({
        email: "sam.carter@contactco.example",
        source: "crawl",
        sourceUrl: "https://contactco.example/team",
        lawfulBasis: "LEGITIMATE_INTEREST_B2B",
        emailStatus: "UNVERIFIED",
      });
      const second = await upsertContact(
        tx,
        company.id,
        { email: "sam.carter@contactco.example", phone: "020 7946 0018" },
        { id: "hunter" },
      );
      expect(second).toMatchObject({
        created: false,
        record: { id: first.record.id, phone: "+442079460018" },
      });
    }));

  it("stores a verifier result with its time", () =>
    withRollback(async (tx) => {
      const { record: company } = await upsertCompany(
        tx,
        { name: "Verify Co", country: "NG" },
        { id: "crawl" },
      );
      await upsertContact(tx, company.id, { email: "info@verify.example" }, { id: "crawl" });
      const { record } = await upsertContact(
        tx,
        company.id,
        { email: "info@verify.example", emailStatus: "VALID", emailType: "ROLE" },
        { id: "hunter", verified: true },
        { clock },
      );
      expect(record).toMatchObject({ emailStatus: "VALID", emailType: "ROLE" });
      expect(record.emailVerifiedAt?.toISOString()).toBe("2026-10-03T09:00:00.000Z");
    }));

  it("resets the verification when the email address changes", () =>
    withRollback(async (tx) => {
      const { record: company } = await upsertCompany(
        tx,
        { name: "Reset Co", country: "NG" },
        { id: "crawl" },
      );
      await upsertContact(
        tx,
        company.id,
        { name: "Tolu Martins", email: "info@reset.example" },
        { id: "crawl" },
      );
      await upsertContact(
        tx,
        company.id,
        { email: "info@reset.example", emailStatus: "VALID", emailType: "ROLE" },
        { id: "hunter", verified: true },
        { clock },
      );
      const { record } = await upsertContact(
        tx,
        company.id,
        { name: "Tolu Martins", email: "tolu@reset.example" },
        { id: "manual:cm1user0000000000000000001", verified: true },
      );
      expect(record).toMatchObject({
        email: "tolu@reset.example",
        emailStatus: "UNVERIFIED",
        emailVerifiedAt: null,
        verifierFlags: null,
        emailType: null,
      });
    }));

  it("refuses an unknown company and an empty candidate", () =>
    withRollback(async (tx) => {
      await expect(
        upsertContact(tx, "cm1missing000000000000000001", { name: "X" }, { id: "crawl" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const { record: company } = await upsertCompany(
        tx,
        { name: "Empty Co", country: "NG" },
        { id: "crawl" },
      );
      await expect(
        upsertContact(tx, company.id, { role: "CEO" }, { id: "crawl" }),
      ).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    }));
});
