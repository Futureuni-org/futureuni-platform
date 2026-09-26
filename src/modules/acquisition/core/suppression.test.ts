import { describe, expect, it } from "vitest";

import {
  createSuppression,
  uniqueDomain,
  uniqueEmail,
  withRollback,
} from "../../../../tests/factories";

import {
  assertNotSuppressed,
  findSuppressions,
  hashSuppressionValue,
  isSuppressed,
  normalizeSuppressionValue,
} from "./suppression";

describe("suppression check (INV-2)", () => {
  it("matches an email, normalising case and mailto links", () =>
    withRollback(async (tx) => {
      const email = uniqueEmail("owner");
      await createSuppression(tx, { type: "EMAIL", value: email });
      expect(await isSuppressed(tx, { email: `  mailto:${email.toUpperCase()} ` })).toBe(true);
      expect(await isSuppressed(tx, { email: uniqueEmail("someone-else") })).toBe(false);
    }));

  it("matches a phone in any Nigerian form", () =>
    withRollback(async (tx) => {
      await createSuppression(tx, {
        type: "PHONE",
        value: "+2348091234567",
        reason: "MANUAL",
        source: "MANUAL",
      });
      expect(await isSuppressed(tx, { phone: "0809 123 4567", defaultCountry: "NG" })).toBe(true);
      expect(await isSuppressed(tx, { phone: "2348091234567" })).toBe(true);
      expect(await isSuppressed(tx, { phone: "0809 123 4568", defaultCountry: "NG" })).toBe(false);
    }));

  it("matches a domain from a website URL, and from the email's own domain", () =>
    withRollback(async (tx) => {
      const domain = uniqueDomain("blocked");
      await createSuppression(tx, {
        type: "DOMAIN",
        value: domain,
        reason: "MANUAL",
        source: "MANUAL",
      });
      expect(await isSuppressed(tx, { domain: `https://www.${domain}/contact` })).toBe(true);
      expect(await isSuppressed(tx, { email: `anyone@${domain}` })).toBe(true);
      expect(await isSuppressed(tx, { email: `anyone@mail.${domain}` })).toBe(true);
    }));

  it("matches the keyed-hash form a data-subject deletion leaves behind (data-model §8.3)", () =>
    withRollback(async (tx) => {
      const email = uniqueEmail("deleted");
      await createSuppression(tx, {
        type: "EMAIL",
        value: hashSuppressionValue(email),
        isHashed: true,
        reason: "DSR_DELETE",
        source: "DSR",
      });
      const matches = await findSuppressions(tx, { email: email.toUpperCase() });
      expect(matches).toEqual([
        expect.objectContaining({ type: "EMAIL", reason: "DSR_DELETE", isHashed: true }),
      ]);
    }));

  it("ignores removed suppressions (the row stays for history)", () =>
    withRollback(async (tx) => {
      const email = uniqueEmail("restored");
      await createSuppression(tx, {
        type: "EMAIL",
        value: email,
        removedAt: new Date(),
        removedReason: "Added by mistake",
      });
      expect(await isSuppressed(tx, { email })).toBe(false);
    }));

  it("throws SUPPRESSED naming the kinds that matched, never the values", () =>
    withRollback(async (tx) => {
      const email = uniqueEmail("unsubscribed");
      await createSuppression(tx, { type: "EMAIL", value: email });
      const failure = assertNotSuppressed(tx, { email, phone: "+447700900999" });
      await expect(failure).rejects.toMatchObject({
        code: "SUPPRESSED",
        details: { types: ["EMAIL"] },
      });
      await expect(failure).rejects.not.toHaveProperty("message", expect.stringContaining(email));
      await expect(
        assertNotSuppressed(tx, { email: uniqueEmail("fine") }),
      ).resolves.toBeUndefined();
    }));

  it("checks nothing when given nothing to check", () =>
    withRollback(async (tx) => {
      expect(await isSuppressed(tx, {})).toBe(false);
    }));

  it("uses the same keyed hash every time, and normalises values the way they're stored", () => {
    expect(hashSuppressionValue("owner@example.com")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSuppressionValue("owner@example.com")).toBe(
      hashSuppressionValue("owner@example.com"),
    );
    expect(normalizeSuppressionValue("EMAIL", " Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeSuppressionValue("PHONE", "0803 123 4567", "NG")).toBe("+2348031234567");
    expect(normalizeSuppressionValue("DOMAIN", "https://www.Example.com.ng/about")).toBe(
      "example.com.ng",
    );
  });

  it("fails closed on an email or phone it can't normalise", () =>
    withRollback(async (tx) => {
      await expect(findSuppressions(tx, { email: "not an email" })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      // A national number without its country can't be checked either.
      await expect(findSuppressions(tx, { phone: "0803 123 4567" })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
      await expect(findSuppressions(tx, { email: "", phone: null })).resolves.toEqual([]);
    }));
});
