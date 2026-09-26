import { parsePhoneNumberFromString, type CountryCode as PhoneCountry } from "libphonenumber-js";
import { getDomain } from "tldts";
import { z } from "zod";

import type { WebsiteKind } from "@/contracts/common";

/**
 * Normalisers for the shared directory (docs/specs/platform.md §3.3). Pure functions: the same
 * input always gives the same output, so matching and suppression checks agree everywhere.
 */

/** Social and link-in-bio hosts: a URL here isn't the business's own website (no domain). */
const SOCIAL_HOSTS: ReadonlySet<string> = new Set([
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "threads.net",
  "threads.com",
  "m.me",
  "pinterest.com",
  "snapchat.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "beacons.ai",
  "bio.link",
  "taplink.cc",
  "linkin.bio",
  "lnk.bio",
  "msha.ke",
  "behance.net",
  "dribbble.com",
  "calendly.com",
]);

/** Marketplaces, directories and hosted profiles: a listing there isn't an own site either. */
const MARKETPLACE_HOSTS: ReadonlySet<string> = new Set([
  "jiji.ng",
  "jumia.com.ng",
  "konga.com",
  "etsy.com",
  "amazon.com",
  "amazon.co.uk",
  "ebay.com",
  "ebay.co.uk",
  "fiverr.com",
  "upwork.com",
  "yelp.com",
  "tripadvisor.com",
  "tripadvisor.co.uk",
  "booking.com",
  "hotels.ng",
  "google.com",
  "goo.gl",
  "g.page",
  "business.site",
  "apple.com",
  // Payment and store pages (one path per seller)
  "paystack.shop",
  "paystack.com",
  "flutterwave.com",
  // Booking, delivery and business directories
  "fresha.com",
  "treatwell.co.uk",
  "yell.com",
  "checkatrade.com",
  "trustpilot.com",
  "bark.com",
  "houzz.com",
  "deliveroo.co.uk",
  "just-eat.co.uk",
  "ubereats.com",
  "glovoapp.com",
  "chowdeck.com",
  "vconnect.com",
  "finelib.com",
  "businesslist.com.ng",
  "nairaland.com",
]);

/** Link shorteners: the real destination is unknown, so the link says nothing about a website. */
const SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "wa.link",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
]);

/**
 * Site builders and publishing platforms that aren't on the Public Suffix List but host each
 * business under its own subdomain (acme.wordpress.com). The full hostname is then the business's
 * domain, so two businesses on one platform never share a domain. A page on the platform's own
 * host (selar.co/acme) is a listing, not an own site.
 */
const HOSTED_PLATFORMS: ReadonlySet<string> = new Set([
  "wordpress.com",
  "weebly.com",
  "godaddysites.com",
  "mystrikingly.com",
  "strikingly.com",
  "substack.com",
  "canva.site",
  "bumpa.shop",
  "mainstack.me",
  "mainstack.store",
  "selar.co",
  "jimdosite.com",
  "site123.me",
  "hashnode.dev",
  "medium.com",
  "wix.com",
  "tumblr.com",
  "webnode.com",
  "yolasite.com",
  "ueniweb.com",
]);

function hostOf(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** The registrable domain of a URL or host, or null (IP addresses, localhost, unknown suffixes). */
function registrableDomain(input: string): string | null {
  const host = hostOf(input);
  if (host === null) return null;
  // Private suffixes count, so each shop on a hosted builder stays distinct (acme.myshopify.com).
  return getDomain(host, { allowPrivateDomains: true });
}

/** What a website URL is, and the domain that identifies the business (own sites only). */
function inspectWebsite(url: string): { kind: WebsiteKind; domain: string | null } {
  const host = hostOf(url);
  const registrable = host === null ? null : getDomain(host, { allowPrivateDomains: true });
  if (host === null || registrable === null || SHORTENER_HOSTS.has(registrable)) {
    return { kind: "UNKNOWN", domain: null };
  }
  if (SOCIAL_HOSTS.has(registrable)) return { kind: "SOCIAL_ONLY", domain: null };
  if (MARKETPLACE_HOSTS.has(registrable)) return { kind: "MARKETPLACE_ONLY", domain: null };
  if (HOSTED_PLATFORMS.has(registrable)) {
    const site = host.replace(/^www\./, "");
    return site === registrable
      ? { kind: "MARKETPLACE_ONLY", domain: null }
      : { kind: "OWN_SITE", domain: site };
  }
  return { kind: "OWN_SITE", domain: registrable };
}

/**
 * Classifies what a company's "website" really is: its own site, only a social profile, or only a
 * marketplace, directory, store or booking listing (the `no_website` signal and websiteKind). A
 * link shortener is UNKNOWN.
 */
export function classifyWebsite(url: string | null | undefined): WebsiteKind {
  if (url === null || url === undefined || url.trim() === "") return "NONE";
  return inspectWebsite(url).kind;
}

/**
 * The normalised domain of a company website: the registrable domain, lower-case, without
 * protocol, `www.`, path or port; for a business hosted on a site builder, its own subdomain
 * (acme.wordpress.com). Social, marketplace and shortened URLs have no domain: they return null.
 *
 * @example normalizeDomain("https://WWW.Example.com.ng/about") // "example.com.ng"
 */
export function normalizeDomain(url: string | null | undefined): string | null {
  if (url === null || url === undefined || url.trim() === "") return null;
  return inspectWebsite(url).domain;
}

const emailSchema = z.email();

/** A trimmed, lower-case email address, or null when it isn't one. Accepts "mailto:" links. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const email = raw
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/\?.*$/, "")
    .toLowerCase();
  return emailSchema.safeParse(email).success ? email : null;
}

/** The registrable domain of an email address (for domain suppressions), or null. */
export function emailDomain(email: string | null | undefined): string | null {
  const normalised = normalizeEmail(email);
  if (normalised === null) return null;
  return registrableDomain(normalised.slice(normalised.lastIndexOf("@") + 1));
}

/**
 * A phone number in E.164 ("+2348031234567"), or null. National numbers use `defaultCountry`
 * (ISO 3166-1 alpha-2). Handles "0803 123 4567", "+234 803 123 4567", "2348031234567" and "00…"
 * forms. Only the shape is checked (a possible number for its country), not whether the number
 * is assigned, so reserved ranges such as the UK's 07700 900xxx normalise too.
 */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountry?: string | null,
): string | null {
  if (raw === null || raw === undefined) return null;
  // An extension ("ext 12", "x204", "#3") isn't part of the number.
  const withoutExtension = raw.replace(/\s*(?:ext\.?|extension|x|#)\s*\d+\s*$/i, "");
  let cleaned = withoutExtension.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.replace("+", "") === "") return null;
  const country = defaultCountry?.toUpperCase();
  const attempts = cleaned.startsWith("+") ? [cleaned] : [cleaned, `+${cleaned}`];
  for (const attempt of attempts) {
    const parsed = parsePhoneNumberFromString(attempt, country as PhoneCountry | undefined);
    if (parsed?.isPossible() === true) return parsed.number;
  }
  return null;
}

/** Legal-form words dropped from the end of a name before comparing (Ltd, PLC, LLC, Nig Ltd…). */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  "ltd",
  "limited",
  "plc",
  "llp",
  "lp",
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "nig",
]);

/**
 * A company name reduced for comparison only: lower case, accents removed, "&" as "and",
 * punctuation removed, a leading "the" and trailing legal-form words dropped.
 *
 * @example normalizeCompanyName("Adunni Bakes & Events Ltd.") // "adunni bakes and events"
 */
export function normalizeCompanyName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&|\+/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const full = words.join(" ");
  if (words[0] === "the" && words.length > 1) words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1] ?? "")) words.pop();
  const reduced = words.join(" ");
  return reduced === "" ? full : reduced;
}
