import "server-only";

import type { Company, Tx } from "@/platform/db";

import {
  findCompanyByDomain,
  findCompanyByPhones,
  findCompanyBySourceRef,
  findCompanyIdByNameAndCity,
  getCompany,
} from "./directory.repo";
import { normalizeCompanyName, normalizeDomain, normalizePhone } from "./normalize";

/** Default trigram similarity for a name + city match. Must be at least 0.3 (pg_trgm's `%`). */
export const NAME_MATCH_THRESHOLD = 0.6;

/** What a source knows about a company before it's in the directory. Raw values are fine: they're normalised here. */
export interface CompanyMatchCandidate {
  name: string;
  /** As found; social and marketplace URLs count as no domain. */
  website?: string | null;
  phones?: readonly string[];
  city?: string | null;
  /** ISO 3166-1 alpha-2; the default country for national phone numbers. */
  country?: string | null;
  /** A provider id we may keep (for example a Google place_id): matched first. */
  externalRef?: { adapterId: string; externalId: string } | null;
}

export type MatchedBy = "externalRef" | "domain" | "phone" | "nameCity";

export interface CompanyMatch {
  company: Company;
  matchedBy: MatchedBy;
}

/**
 * Finds the directory company a candidate refers to, in the dedupe order of the source-adapter
 * contract (rule 4): the external reference, then the normalised domain, then a normalised phone,
 * then the normalised name in the same city by trigram similarity. Soft-deleted companies never
 * match. Returns null when nothing matches.
 */
export async function findMatchingCompany(
  tx: Tx,
  candidate: CompanyMatchCandidate,
  options: { nameThreshold?: number } = {},
): Promise<CompanyMatch | null> {
  if (candidate.externalRef) {
    const byRef = await findCompanyBySourceRef(tx, candidate.externalRef);
    if (byRef !== null) return { company: byRef, matchedBy: "externalRef" };
  }

  const domain = normalizeDomain(candidate.website);
  if (domain !== null) {
    const byDomain = await findCompanyByDomain(tx, domain);
    if (byDomain !== null) return { company: byDomain, matchedBy: "domain" };
  }

  const phones = normalizePhones(candidate.phones, candidate.country);
  if (phones.length > 0) {
    const byPhone = await findCompanyByPhones(tx, phones);
    if (byPhone !== null) return { company: byPhone, matchedBy: "phone" };
  }

  const city = candidate.city?.trim();
  if (city !== undefined && city !== "") {
    const threshold = Math.max(options.nameThreshold ?? NAME_MATCH_THRESHOLD, 0.3);
    const byName = await findCompanyIdByNameAndCity(
      tx,
      normalizeCompanyName(candidate.name),
      city,
      threshold,
    );
    if (byName !== null) {
      const company = await getCompany(tx, byName.id);
      // A similar name in the same city isn't the same business when the domains or phones say
      // otherwise ("Lagos Dental Clinic" and "Lekki Dental Clinic" score 0.6).
      if (company !== null && !contradicts(company, domain, phones)) {
        return { company, matchedBy: "nameCity" };
      }
    }
  }
  return null;
}

/** True when both sides have a domain and they differ, or both have phones and none are shared. */
function contradicts(company: Company, domain: string | null, phones: readonly string[]): boolean {
  if (domain !== null && company.normalizedDomain !== null && company.normalizedDomain !== domain) {
    return true;
  }
  return (
    phones.length > 0 &&
    company.phones.length > 0 &&
    !phones.some((phone) => company.phones.includes(phone))
  );
}

/** Distinct E.164 numbers from raw phone strings. */
export function normalizePhones(
  phones: readonly string[] | undefined,
  country?: string | null,
): string[] {
  const normalised = (phones ?? []).map((phone) => normalizePhone(phone, country));
  return [...new Set(normalised.filter((phone): phone is string => phone !== null))];
}
