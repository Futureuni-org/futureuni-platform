/**
 * @/platform/directory: the shared companies and contacts directory (docs/specs/platform.md §3.3).
 * Every module matches and writes companies and contacts through here, so dedupe and provenance
 * (INV-10) live in one place.
 */

export {
  classifyWebsite,
  emailDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./normalize";
export {
  findMatchingCompany,
  NAME_MATCH_THRESHOLD,
  normalizePhones,
  type CompanyMatch,
  type CompanyMatchCandidate,
  type MatchedBy,
} from "./match";
export {
  upsertCompany,
  upsertContact,
  type CompanyCandidate,
  type ContactCandidate,
  type DirectorySource,
  type UpsertOptions,
  type UpsertResult,
} from "./upsert";
