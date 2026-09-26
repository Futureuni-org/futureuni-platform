import "server-only";

import {
  CountryCodeSchema,
  HttpUrlSchema,
  type Clock,
  type CompanySizeRange,
  type ContactSeniority,
  type EmailStatus,
  type EmailType,
  type LawfulBasis,
  type LegalForm,
  type Market,
  type WhatsAppStatus,
} from "@/contracts/common";
import {
  CompanySocialsSchema,
  FieldSourcesSchema,
  type CompanySocials,
  type FieldSources,
} from "@/contracts/enrichment";
import { AppError } from "@/lib/errors";
import {
  isUniqueViolation,
  withSavepoint,
  type Company,
  type Contact,
  Prisma,
  type Tx,
} from "@/platform/db";

import {
  createCompany,
  createContact,
  findContact,
  getCompany,
  updateCompany,
  updateContact,
  upsertCompanySourceRef,
} from "./directory.repo";
import {
  findMatchingCompany,
  normalizePhones,
  type CompanyMatchCandidate,
  type MatchedBy,
} from "./match";
import {
  classifyWebsite,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./normalize";

/** Where a record's data came from (INV-10). */
export interface DirectorySource {
  /** Adapter id, "crawl", "hunter", "referral", "csv-import" or "manual:<userId>". */
  id: string;
  /** Where the data was seen: a page, listing or profile. */
  url?: string | null;
  /** True when the source verified the data (Companies House, the email verifier, a human). */
  verified?: boolean;
  /** Defaults to LEGITIMATE_INTEREST_B2B. */
  lawfulBasis?: LawfulBasis;
}

export interface CompanyCandidate extends CompanyMatchCandidate {
  primaryPhone?: string | null;
  region?: string | null;
  addressLine?: string | null;
  postcode?: string | null;
  /** Needed when there's no country; otherwise derived from it (NG → NIGERIA). */
  market?: Market | null;
  timezone?: string | null;
  industry?: string | null;
  legalForm?: LegalForm | null;
  legalFormSource?: string | null;
  legalFormConfidence?: number | null;
  companyNumber?: string | null;
  sizeRange?: CompanySizeRange | null;
  socials?: CompanySocials | null;
  externalRef?: { adapterId: string; externalId: string; url?: string | null } | null;
  /**
   * Where the search that found the company was looking (our own fact). For a transient source
   * (Google Places) this is the only location stored: the listing's own address, city and region
   * are used for matching only (INV-14).
   */
  searchLocation?: { city?: string | null; region?: string | null } | null;
}

export interface ContactCandidate {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  seniority?: ContactSeniority | null;
  email?: string | null;
  emailType?: EmailType | null;
  /** A verifier result; written with emailVerifiedAt. */
  emailStatus?: Exclude<EmailStatus, "UNVERIFIED"> | null;
  phone?: string | null;
  whatsappStatus?: WhatsAppStatus | null;
  linkedinUrl?: string | null;
}

export interface UpsertOptions {
  clock?: Clock;
  /** Trigram similarity for name + city matching (default NAME_MATCH_THRESHOLD). */
  nameThreshold?: number;
}

export interface UpsertResult<T> {
  record: T;
  created: boolean;
}

const systemClock: Clock = { now: () => new Date() };

/**
 * Sources whose content we may use only transiently (INV-14). Google's Maps Platform terms let us
 * keep the place_id and nothing else: a Places-only company is stored under the placeholder name
 * "Place <last 6 of place_id>", and its name, address, city, phone and website are used for
 * matching only (docs/specs/module-acquisition.md §3.5.1). Our own facts are kept: the country
 * and city of the search that found it (`searchLocation`), its timezone and our industry label.
 */
const TRANSIENT_SOURCES: ReadonlySet<string> = new Set(["google-places"]);
const TRANSIENT_PERSISTED_FIELDS: ReadonlySet<string> = new Set([
  "country",
  "city",
  "region",
  "timezone",
  "industry",
]);

type Scalar = string | number | null | undefined;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === "UNKNOWN";
}

function marketFor(country: string): Market {
  return country === "NG" ? "NIGERIA" : "INTERNATIONAL";
}

function trimmed(value: string | null | undefined): string | null {
  const result = value?.trim();
  return result === undefined || result === "" ? null : result;
}

/**
 * A record's per-field provenance. Entries are parsed one by one, so a single malformed entry
 * doesn't erase the others (and with them the protection of verified data).
 */
function parseFieldSources(value: Prisma.JsonValue): FieldSources {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const entry = FieldSourcesSchema.valueType;
  const sources: FieldSources = {};
  for (const [field, raw] of Object.entries(value)) {
    const parsed = entry.safeParse(raw);
    if (parsed.success) sources[field] = parsed.data;
  }
  return sources;
}

function sourceEntry(source: DirectorySource, now: Date): FieldSources[string] {
  const url = HttpUrlSchema.safeParse(source.url ?? undefined);
  return {
    source: source.id,
    collectedAt: now.toISOString(),
    verified: source.verified === true,
    ...(url.success ? { sourceUrl: url.data } : {}),
  };
}

/**
 * Whether a new value may replace an existing one: fill empty fields; replace a value from a
 * transient source; replace unverified data only with verified data. Verified data is never
 * overwritten by unverified data (enrichment contract rule 12).
 */
function mayReplace(
  existing: Scalar,
  next: Scalar,
  existingSource: FieldSources[string] | undefined,
  source: DirectorySource,
): boolean {
  if (isEmpty(next) || existing === next) return false;
  if (isEmpty(existing)) return true;
  if (existingSource !== undefined && TRANSIENT_SOURCES.has(existingSource.source)) return true;
  return source.verified === true && existingSource?.verified !== true;
}

// ---------------------------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------------------------

type CompanyScalarField =
  | "name"
  | "website"
  | "primaryPhone"
  | "country"
  | "city"
  | "region"
  | "addressLine"
  | "postcode"
  | "timezone"
  | "industry"
  | "legalForm"
  | "legalFormSource"
  | "legalFormConfidence"
  | "companyNumber"
  | "sizeRange";

/**
 * The candidate's values, normalised, limited to what the source may persist. National phone
 * numbers use the candidate's country, else `fallbackCountry` (the existing company's).
 */
function persistableCompanyValues(
  candidate: CompanyCandidate,
  source: DirectorySource,
  fallbackCountry: string | null = null,
) {
  const country = CountryCodeSchema.safeParse(candidate.country?.trim().toUpperCase());
  const phoneCountry = candidate.country ?? fallbackCountry;
  const phones = normalizePhones(candidate.phones, phoneCountry);
  const primaryPhone = normalizePhone(candidate.primaryPhone, phoneCountry) ?? phones[0] ?? null;
  const values: Record<CompanyScalarField, Scalar> = {
    name: trimmed(candidate.name),
    website: trimmed(candidate.website),
    primaryPhone,
    country: country.success ? country.data : null,
    city: trimmed(candidate.city),
    region: trimmed(candidate.region),
    addressLine: trimmed(candidate.addressLine),
    postcode: trimmed(candidate.postcode),
    timezone: trimmed(candidate.timezone),
    industry: trimmed(candidate.industry),
    legalForm: candidate.legalForm ?? null,
    legalFormSource: trimmed(candidate.legalFormSource),
    legalFormConfidence: candidate.legalFormConfidence ?? null,
    companyNumber: trimmed(candidate.companyNumber),
    sizeRange: candidate.sizeRange ?? null,
  };
  if (!TRANSIENT_SOURCES.has(source.id)) {
    return { values, phones, socials: candidate.socials ?? {} };
  }
  for (const field of Object.keys(values) as CompanyScalarField[]) {
    if (!TRANSIENT_PERSISTED_FIELDS.has(field)) values[field] = null;
  }
  // The listing's own city and region came from Google: only the search's location is ours.
  values.city = trimmed(candidate.searchLocation?.city);
  values.region = trimmed(candidate.searchLocation?.region);
  return { values, phones: [] as string[], socials: {} };
}

function placeholderName(candidate: CompanyCandidate): string {
  const placeId = candidate.externalRef?.externalId;
  if (placeId === undefined || placeId.length < 6) {
    throw new AppError(
      "VALIDATION_FAILED",
      "A Google Places company needs its place_id (externalRef).",
    );
  }
  return `Place ${placeId.slice(-6)}`;
}

/**
 * Finds the company a candidate refers to (findMatchingCompany) and merges the new data into it,
 * or creates it. Records the source, collection time and lawful basis (INV-10) and per-field
 * provenance in `fieldSources`. Keeps any external reference (CompanySourceRef).
 *
 * Call it inside a transaction: a concurrent insert of the same domain is caught with a savepoint
 * and the candidate is merged into the winner instead.
 */
export async function upsertCompany(
  tx: Tx,
  candidate: CompanyCandidate,
  source: DirectorySource,
  options: UpsertOptions = {},
): Promise<UpsertResult<Company> & { matchedBy: MatchedBy | null }> {
  const now = (options.clock ?? systemClock).now();
  const match = await findMatchingCompany(tx, candidate, options);
  let result: UpsertResult<Company> & { matchedBy: MatchedBy | null };

  if (match === null) {
    try {
      const record = await withSavepoint(tx, () =>
        createCompany(tx, newCompanyData(candidate, source, now)),
      );
      result = { record, created: true, matchedBy: null };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Someone else created it first: merge into theirs.
      const winner = await findMatchingCompany(tx, candidate, options);
      if (winner === null) throw error;
      result = {
        record: await mergeCompany(tx, winner.company, candidate, source, now),
        created: false,
        matchedBy: winner.matchedBy,
      };
    }
  } else {
    result = {
      record: await mergeCompany(tx, match.company, candidate, source, now),
      created: false,
      matchedBy: match.matchedBy,
    };
  }

  if (candidate.externalRef) {
    await upsertCompanySourceRef(tx, {
      companyId: result.record.id,
      adapterId: candidate.externalRef.adapterId,
      externalId: candidate.externalRef.externalId,
      url: candidate.externalRef.url ?? null,
      now,
    });
  }
  return result;
}

function newCompanyData(
  candidate: CompanyCandidate,
  source: DirectorySource,
  now: Date,
): Prisma.CompanyUncheckedCreateInput {
  const { values, phones, socials } = persistableCompanyValues(candidate, source);
  const name = TRANSIENT_SOURCES.has(source.id)
    ? placeholderName(candidate)
    : (values.name as string | null);
  if (name === null) throw new AppError("VALIDATION_FAILED", "A company needs a name.");
  const country = values.country as string | null;
  const market = country === null ? candidate.market : marketFor(country);
  if (market === null || market === undefined) {
    throw new AppError("VALIDATION_FAILED", "A company needs a country or a market.");
  }

  const entry = sourceEntry(source, now);
  const fieldSources: FieldSources = { name: entry };
  const data: Prisma.CompanyUncheckedCreateInput = {
    name,
    normalizedName: normalizeCompanyName(name),
    market,
    firstSource: source.id,
    firstSourceUrl: trimmed(source.url),
    collectedAt: now,
    lawfulBasis: source.lawfulBasis ?? "LEGITIMATE_INTEREST_B2B",
    phones,
    socials,
  };
  for (const field of Object.keys(values) as CompanyScalarField[]) {
    const value = values[field];
    if (field === "name" || isEmpty(value)) continue;
    Object.assign(data, { [field]: value });
    fieldSources[field] = entry;
  }
  if (phones.length > 0) fieldSources.phones = entry;
  if (Object.keys(socials).length > 0) fieldSources.socials = entry;
  const website = values.website as string | null;
  data.websiteKind = website === null ? "UNKNOWN" : classifyWebsite(website);
  data.normalizedDomain = normalizeDomain(website);
  data.fieldSources = fieldSources;
  return data;
}

async function mergeCompany(
  tx: Tx,
  existing: Company,
  candidate: CompanyCandidate,
  source: DirectorySource,
  now: Date,
): Promise<Company> {
  const { values, phones, socials } = persistableCompanyValues(candidate, source, existing.country);
  const sources = parseFieldSources(existing.fieldSources);
  const entry = sourceEntry(source, now);
  const data: Prisma.CompanyUncheckedUpdateInput = {};

  for (const field of Object.keys(values) as CompanyScalarField[]) {
    const next = values[field];
    let replace = mayReplace(existing[field], next, sources[field], source);
    // An own website beats a social or marketplace link, and is never replaced by one.
    if (field === "website" && typeof next === "string") {
      const nextIsOwn = classifyWebsite(next) === "OWN_SITE";
      if (!replace) replace = existing.websiteKind !== "OWN_SITE" && nextIsOwn;
      else if (existing.websiteKind === "OWN_SITE" && !nextIsOwn) replace = false;
    }
    if (!replace) continue;
    Object.assign(data, { [field]: next });
    sources[field] = entry;
  }
  if (typeof data.name === "string") data.normalizedName = normalizeCompanyName(data.name);
  if (typeof data.website === "string") {
    data.websiteKind = classifyWebsite(data.website);
    data.normalizedDomain = normalizeDomain(data.website);
  }
  if (typeof data.country === "string") data.market = marketFor(data.country);

  const mergedPhones = [...new Set([...existing.phones, ...phones])];
  if (mergedPhones.length !== existing.phones.length) {
    data.phones = mergedPhones;
    sources.phones = entry;
  }

  const parsedSocials = CompanySocialsSchema.safeParse(existing.socials);
  const existingSocials: Record<string, string> = Object.fromEntries(
    Object.entries(parsedSocials.success ? parsedSocials.data : {}).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
  const addedSocials = Object.entries(socials).filter(
    (pair): pair is [string, string] =>
      typeof pair[1] === "string" && isEmpty(existingSocials[pair[0]]),
  );
  if (addedSocials.length > 0) {
    data.socials = { ...existingSocials, ...Object.fromEntries(addedSocials) };
    sources.socials = entry;
  }

  if (Object.keys(data).length === 0) return existing;
  data.fieldSources = sources;
  // A new domain can collide with another live company's (a duplicate in the directory): the
  // savepoint keeps the caller's transaction usable, and the caller gets CONFLICT.
  try {
    return await withSavepoint(tx, () => updateCompany(tx, existing.id, data));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("CONFLICT", "Another company in the directory already has that website.", {
        details: { companyId: existing.id },
      });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------------------------

type ContactScalarField =
  | "name"
  | "firstName"
  | "lastName"
  | "role"
  | "seniority"
  | "email"
  | "emailType"
  | "phone"
  | "whatsappStatus"
  | "linkedinUrl";

function contactValues(
  candidate: ContactCandidate,
  country: string | null,
): Record<ContactScalarField, Scalar> {
  return {
    name: trimmed(candidate.name),
    firstName: trimmed(candidate.firstName),
    lastName: trimmed(candidate.lastName),
    role: trimmed(candidate.role),
    seniority: candidate.seniority ?? null,
    email: normalizeEmail(candidate.email),
    emailType: candidate.emailType ?? null,
    phone: normalizePhone(candidate.phone, country),
    whatsappStatus: candidate.whatsappStatus ?? null,
    linkedinUrl: trimmed(candidate.linkedinUrl),
  };
}

/**
 * Finds the company's contact the candidate refers to (by email, then phone, then exact name) and
 * merges the new data into it, or creates it with its source, collection time and lawful basis
 * (INV-10). Anonymised contacts are never merged into. Throws NOT_FOUND for an unknown or deleted
 * company, and VALIDATION_FAILED when the candidate has no name, email or phone.
 */
export async function upsertContact(
  tx: Tx,
  companyId: string,
  candidate: ContactCandidate,
  source: DirectorySource,
  options: UpsertOptions = {},
): Promise<UpsertResult<Contact>> {
  const company = await getCompany(tx, companyId);
  if (company === null) throw new AppError("NOT_FOUND", "That company isn't in the directory.");
  const now = (options.clock ?? systemClock).now();
  const values = contactValues(candidate, company.country);
  const keys = {
    email: values.email as string | null,
    phone: values.phone as string | null,
    name: values.name as string | null,
  };
  if (keys.email === null && keys.phone === null && keys.name === null) {
    throw new AppError("VALIDATION_FAILED", "A contact needs a name, an email or a phone number.");
  }

  const existing = await findContact(tx, companyId, keys);
  if (existing !== null) {
    return {
      record: await mergeContact(tx, existing, candidate, values, source, now),
      created: false,
    };
  }
  try {
    const record = await withSavepoint(tx, () =>
      createContact(tx, newContactData(companyId, candidate, values, source, now)),
    );
    return { record, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findContact(tx, companyId, keys);
    if (winner === null) throw error;
    return {
      record: await mergeContact(tx, winner, candidate, values, source, now),
      created: false,
    };
  }
}

function newContactData(
  companyId: string,
  candidate: ContactCandidate,
  values: Record<ContactScalarField, Scalar>,
  source: DirectorySource,
  now: Date,
): Prisma.ContactUncheckedCreateInput {
  const entry = sourceEntry(source, now);
  const fieldSources: FieldSources = {};
  const data: Prisma.ContactUncheckedCreateInput = {
    companyId,
    source: source.id,
    sourceUrl: trimmed(source.url),
    collectedAt: now,
    lawfulBasis: source.lawfulBasis ?? "LEGITIMATE_INTEREST_B2B",
  };
  for (const field of Object.keys(values) as ContactScalarField[]) {
    const value = values[field];
    if (isEmpty(value)) continue;
    Object.assign(data, { [field]: value });
    fieldSources[field] = entry;
  }
  if (candidate.emailStatus && values.email !== null) {
    data.emailStatus = candidate.emailStatus;
    data.emailVerifiedAt = now;
    fieldSources.emailStatus = { ...entry, verified: true };
  }
  data.fieldSources = fieldSources;
  return data;
}

async function mergeContact(
  tx: Tx,
  existing: Contact,
  candidate: ContactCandidate,
  values: Record<ContactScalarField, Scalar>,
  source: DirectorySource,
  now: Date,
): Promise<Contact> {
  if (existing.isAnonymized) return existing;
  const sources = parseFieldSources(existing.fieldSources);
  const entry = sourceEntry(source, now);
  const data: Prisma.ContactUncheckedUpdateInput = {};
  for (const field of Object.keys(values) as ContactScalarField[]) {
    if (!mayReplace(existing[field], values[field], sources[field], source)) continue;
    Object.assign(data, { [field]: values[field] });
    sources[field] = entry;
  }
  // A new address starts unverified: the old verifier result belonged to the old address.
  if (typeof data.email === "string" && data.email !== existing.email) {
    data.emailStatus = "UNVERIFIED";
    data.emailVerifiedAt = null;
    data.verifierFlags = Prisma.DbNull;
    if (data.emailType === undefined) data.emailType = candidate.emailType ?? null;
    delete sources.emailStatus;
  }
  // A verifier result for this contact's address is always newer than the stored status.
  const email = (data.email as string | undefined) ?? existing.email;
  if (
    candidate.emailStatus &&
    email !== null &&
    (values.email === null || values.email === email)
  ) {
    data.emailStatus = candidate.emailStatus;
    data.emailVerifiedAt = now;
    sources.emailStatus = { ...entry, verified: true };
  }
  if (Object.keys(data).length === 0) return existing;
  data.fieldSources = sources;
  return updateContact(tx, existing.id, data);
}
