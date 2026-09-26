import { describe, expect, it } from "vitest";

import { withRollback } from "../../../tests/factories/test-db";

import { findMatchingCompany } from "./match";
import { upsertCompany } from "./upsert";

const crawl = { id: "crawl" };

describe("findMatchingCompany (dedupe order: external ref → domain → phone → name + city)", () => {
  it("AC-13.1: matches https://WWW.Example.com.ng/about to the company stored as example.com.ng", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Example Foods Ltd", website: "example.com.ng", country: "NG", city: "Lagos" },
        crawl,
      );
      expect(record.normalizedDomain).toBe("example.com.ng");
      const match = await findMatchingCompany(tx, {
        name: "Something Else",
        website: "https://WWW.Example.com.ng/about",
      });
      expect(match).toMatchObject({ company: { id: record.id }, matchedBy: "domain" });
    }));

  it("doesn't treat an Instagram URL as a domain", () =>
    withRollback(async (tx) => {
      await upsertCompany(
        tx,
        { name: "Insta Shop", website: "https://www.instagram.com/instashop", country: "NG" },
        crawl,
      );
      const match = await findMatchingCompany(tx, {
        name: "Another Insta Shop",
        website: "https://www.instagram.com/someoneelse",
      });
      expect(match).toBeNull();
    }));

  it("matches a Nigerian number in 080…, +234… and 234… forms", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Mama Put Kitchen", phones: ["+234 803 123 4567"], country: "NG", city: "Lekki" },
        crawl,
      );
      for (const phone of ["0803 123 4567", "2348031234567", "+2348031234567"]) {
        const match = await findMatchingCompany(tx, {
          name: "Unrelated",
          phones: [phone],
          country: "NG",
        });
        expect(match).toMatchObject({ company: { id: record.id }, matchedBy: "phone" });
      }
    }));

  it("matches a UK number stored in E.164", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Thames Dental", phones: ["020 7946 0018"], country: "GB", city: "London" },
        crawl,
      );
      const match = await findMatchingCompany(tx, { name: "X", phones: ["+44 20 7946 0018"] });
      expect(match?.company.id).toBe(record.id);
    }));

  it("matches a similar name in the same city, and not in another city", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        { name: "Adunni Bakes & Events Ltd", country: "NG", city: "Lagos" },
        crawl,
      );
      const same = await findMatchingCompany(tx, {
        name: "Adunni Bakes and Events",
        city: "lagos",
      });
      expect(same).toMatchObject({ company: { id: record.id }, matchedBy: "nameCity" });
      expect(
        await findMatchingCompany(tx, { name: "Adunni Bakes and Events", city: "Abuja" }),
      ).toBeNull();
      expect(
        await findMatchingCompany(tx, { name: "Totally Different Hardware", city: "Lagos" }),
      ).toBeNull();
      expect(await findMatchingCompany(tx, { name: "Adunni Bakes and Events" })).toBeNull(); // no city, no name match
    }));

  it("doesn't match a similar name when the domains or phones say it's another business", () =>
    withRollback(async (tx) => {
      await upsertCompany(
        tx,
        {
          name: "Lagos Dental Clinic",
          website: "https://lagosdental.example",
          phones: ["0803 000 1111"],
          country: "NG",
          city: "Lagos",
        },
        crawl,
      );
      const otherDomain = await findMatchingCompany(tx, {
        name: "Lagos Dental Clinic Ltd",
        website: "https://lekkidental.example",
        country: "NG",
        city: "Lagos",
      });
      expect(otherDomain).toBeNull();
      const otherPhone = await findMatchingCompany(tx, {
        name: "Lagos Dental Clinic Ltd",
        phones: ["0803 000 2222"],
        country: "NG",
        city: "Lagos",
      });
      expect(otherPhone).toBeNull();
      const nothingToCompare = await findMatchingCompany(tx, {
        name: "Lagos Dental Clinic Ltd",
        city: "Lagos",
      });
      expect(nothingToCompare?.matchedBy).toBe("nameCity");
    }));

  it("matches an external reference first", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        {
          name: "Ignored Places Name",
          country: "NG",
          city: "Lagos",
          externalRef: { adapterId: "google-places", externalId: "ChIJplaceid000000000001" },
        },
        { id: "google-places" },
      );
      const match = await findMatchingCompany(tx, {
        name: "Anything",
        externalRef: { adapterId: "google-places", externalId: "ChIJplaceid000000000001" },
      });
      expect(match).toMatchObject({ company: { id: record.id }, matchedBy: "externalRef" });
    }));

  it("never matches a soft-deleted company", () =>
    withRollback(async (tx) => {
      const { record } = await upsertCompany(
        tx,
        {
          name: "Gone Ltd",
          website: "gone.example",
          phones: ["+442079460019"],
          country: "GB",
          city: "Leeds",
        },
        crawl,
      );
      await tx.company.update({ where: { id: record.id }, data: { deletedAt: new Date() } });
      expect(
        await findMatchingCompany(tx, { name: "Gone Ltd", website: "gone.example", city: "Leeds" }),
      ).toBeNull();
      expect(await findMatchingCompany(tx, { name: "X", phones: ["+442079460019"] })).toBeNull();
    }));
});
