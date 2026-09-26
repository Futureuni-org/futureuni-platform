import { describe, expect, it } from "vitest";

import {
  classifyWebsite,
  emailDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./normalize";

describe("normalizeDomain", () => {
  it.each([
    ["https://WWW.Example.com.ng/about", "example.com.ng"], // AC-13.1
    ["http://example.com:8080/path?x=1#top", "example.com"],
    ["www.acme.co.uk", "acme.co.uk"],
    ["shop.acme.co.uk", "acme.co.uk"],
    ["EXAMPLE.ng.", "example.ng"],
    // Hosted builders are private suffixes: each shop stays distinct.
    ["https://acme.myshopify.com/collections", "acme.myshopify.com"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    "https://www.instagram.com/mamaputkitchen", // a social profile is not a website
    "https://m.facebook.com/acme",
    "linktr.ee/acme",
    "https://jiji.ng/lagos/services/acme",
    "https://maps.google.com/?cid=1234567890",
    "https://acme.business.site",
    "",
    "   ",
    "not a url at all",
    "192.168.1.1",
    "localhost:3000",
    "ftp://example.com",
    null,
    undefined,
  ])("%s → no domain", (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe("classifyWebsite", () => {
  it("tells own sites from social and marketplace links", () => {
    expect(classifyWebsite("https://example.com")).toBe("OWN_SITE");
    expect(classifyWebsite("https://www.instagram.com/acme")).toBe("SOCIAL_ONLY");
    expect(classifyWebsite("https://wa.me/2348031234567")).toBe("SOCIAL_ONLY");
    expect(classifyWebsite("https://jiji.ng/acme")).toBe("MARKETPLACE_ONLY");
    expect(classifyWebsite("")).toBe("NONE");
    expect(classifyWebsite(null)).toBe("NONE");
    expect(classifyWebsite("http://[::zz]")).toBe("UNKNOWN");
  });

  it("keeps businesses on a shared host apart, and treats pages on it as listings", () => {
    // Builders not on the Public Suffix List: the business's own subdomain is its domain.
    expect(normalizeDomain("https://acme.wordpress.com/about")).toBe("acme.wordpress.com");
    expect(normalizeDomain("https://acme.bumpa.shop")).toBe("acme.bumpa.shop");
    expect(normalizeDomain("https://www.acme.godaddysites.com")).toBe("acme.godaddysites.com");
    expect(normalizeDomain("https://other.wordpress.com")).not.toBe(
      normalizeDomain("https://acme.wordpress.com"),
    );
    // A page on the platform's own host is a listing, not an own site.
    expect(classifyWebsite("https://selar.co/acme")).toBe("MARKETPLACE_ONLY");
    expect(normalizeDomain("https://selar.co/acme")).toBeNull();
    // Booking, delivery, store and directory pages: one path per business, never a domain.
    for (const url of [
      "https://www.fresha.com/a/salon-a",
      "https://paystack.shop/acme",
      "https://flutterwave.com/store/acme",
      "https://www.yell.com/biz/acme",
      "https://deliveroo.co.uk/menu/london/acme",
    ]) {
      expect(classifyWebsite(url), url).toBe("MARKETPLACE_ONLY");
      expect(normalizeDomain(url), url).toBeNull();
    }
    expect(classifyWebsite("https://www.threads.com/@acme")).toBe("SOCIAL_ONLY");
    expect(classifyWebsite("https://www.behance.net/acme")).toBe("SOCIAL_ONLY");
    // A shortened link says nothing about the destination.
    expect(classifyWebsite("https://bit.ly/3abcde")).toBe("UNKNOWN");
    expect(normalizeDomain("https://wa.link/abc123")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it.each([
    ["0803 123 4567", "NG", "+2348031234567"],
    ["+234 803 123 4567", "NG", "+2348031234567"],
    ["234 803 123 4567", "NG", "+2348031234567"],
    ["2348031234567", null, "+2348031234567"],
    ["(080) 3123-4567", "ng", "+2348031234567"],
    ["07700 900123", "GB", "+447700900123"], // the UK drama range: reserved, but well formed
    ["+44 7700 900123", null, "+447700900123"],
    ["0044 7700 900123", null, "+447700900123"],
    ["020 7946 0018", "GB", "+442079460018"],
    ["+1 (212) 555-0100", "US", "+12125550100"],
    // An extension isn't part of the number.
    ["0803 123 4567 ext 12", "NG", "+2348031234567"],
    ["020 7946 0018 ext. 204", "GB", "+442079460018"],
    ["+44 20 7946 0018 x204", null, "+442079460018"],
  ])("%s (%s) → %s", (raw, country, expected) => {
    expect(normalizePhone(raw, country)).toBe(expected);
  });

  it.each([
    ["12345", "NG"],
    ["", "NG"],
    ["call us", "GB"],
    [null, "NG"],
    ["0803 123 4567", null],
  ])("%s (%s) → null", (raw, country) => {
    expect(normalizePhone(raw, country)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims, lower-cases and accepts mailto links", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
    expect(normalizeEmail("mailto:Info@Acme.ng?subject=Hello")).toBe("info@acme.ng");
  });

  it("rejects what isn't an email", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("owner@")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it("finds the registrable domain of an address", () => {
    expect(emailDomain("tolu@mail.example.co.uk")).toBe("example.co.uk");
    expect(emailDomain("nope")).toBeNull();
  });
});

describe("normalizeCompanyName", () => {
  it.each([
    ["Adunni Bakes & Events Ltd.", "adunni bakes and events"],
    ["The Coffee House Limited", "coffee house"],
    ["Café Olé PLC", "cafe ole"],
    ["Mama Put Kitchen (Nig) Ltd", "mama put kitchen"],
    ["Northwind Traders LLC", "northwind traders"],
    ["Acme + Sons Co.", "acme and sons"],
    ["Ltd", "ltd"],
  ])("%s → %s", (name, expected) => {
    expect(normalizeCompanyName(name)).toBe(expected);
  });
});
