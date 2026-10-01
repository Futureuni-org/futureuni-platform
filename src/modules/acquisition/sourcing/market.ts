/**
 * Market and country derivation for a sourced record (Phase 8; module spec §3.4,
 * source-adapter.md rule 5). Order: explicit country → phone country code → address country →
 * website ccTLD. `NG` means NIGERIA; any other country means INTERNATIONAL. A record whose country
 * can't be derived keeps the market of the adapter invocation that found it (the runner passes it).
 *
 * Pure functions: the same input always derives the same market, so out-of-market filtering and
 * tests agree with the runner.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getPublicSuffix } from "tldts";

import { CountryCodeSchema, type Market } from "@/contracts/common";

/** ccTLD → ISO 3166-1 alpha-2, for the country suffixes FUTUREUNI actually targets. */
const CCTLD_COUNTRY: Readonly<Record<string, string>> = {
  ng: "NG",
  "com.ng": "NG",
  "org.ng": "NG",
  "co.uk": "GB",
  "org.uk": "GB",
  uk: "GB",
  ie: "IE",
  ca: "CA",
  us: "US",
  de: "DE",
  at: "AT",
  it: "IT",
  es: "ES",
  be: "BE",
  fr: "FR",
  nl: "NL",
};

function normalizeCountry(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const parsed = CountryCodeSchema.safeParse(raw.trim().toUpperCase());
  return parsed.success ? parsed.data : null;
}

/** The country a phone number belongs to (from its country code), or null. */
function countryFromPhone(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined || phone.trim() === "") return null;
  const parsed = parsePhoneNumberFromString(phone.trim());
  return parsed?.country ?? null;
}

/** The country a website's ccTLD implies (`.com.ng` → NG, `.co.uk` → GB), or null for generic TLDs. */
function countryFromDomain(domain: string | null | undefined): string | null {
  if (domain === null || domain === undefined || domain.trim() === "") return null;
  const suffix = getPublicSuffix(domain.trim(), { allowPrivateDomains: false });
  if (suffix === null) return null;
  return CCTLD_COUNTRY[suffix.toLowerCase()] ?? null;
}

export interface CountryFacts {
  /** An explicit country the provider gave (highest priority). */
  country?: string | null | undefined;
  /** The record's phone in E.164, or a raw phone with its country code. */
  phone?: string | null | undefined;
  /** A country parsed from the address. */
  addressCountry?: string | null | undefined;
  /** The company's normalised registrable domain (own sites only), for the ccTLD. */
  domain?: string | null | undefined;
}

/**
 * The ISO 3166-1 alpha-2 country for a record, or null when none can be derived. Tries, in order:
 * the explicit country, the phone country code, the address country, then the website ccTLD.
 */
export function deriveCountry(facts: CountryFacts): string | null {
  return (
    normalizeCountry(facts.country) ??
    countryFromPhone(facts.phone) ??
    normalizeCountry(facts.addressCountry) ??
    countryFromDomain(facts.domain)
  );
}

/** `NG` is the Nigerian market; every other country is international. */
export function marketForCountry(country: string): Market {
  return country === "NG" ? "NIGERIA" : "INTERNATIONAL";
}

export interface DerivedMarket {
  country: string | null;
  market: Market;
}

/**
 * Derives a record's country and market. When no country can be derived, the market falls back to
 * `fallbackMarket` (the market the adapter was invoked for), so a record can't be wrongly dropped
 * as out-of-market for want of a country.
 */
export function deriveMarket(facts: CountryFacts, fallbackMarket: Market): DerivedMarket {
  const country = deriveCountry(facts);
  return {
    country,
    market: country === null ? fallbackMarket : marketForCountry(country),
  };
}
