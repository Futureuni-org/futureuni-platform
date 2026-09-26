/** Companies, contacts, source refs and notes (data-model §10.4). */

import {
  CompanySocialsSchema,
  FieldSourcesSchema,
  TechHintsSchema,
  VerifierFlagsSchema,
  type FieldSources,
} from "@/contracts/enrichment";
import type { Prisma } from "@/platform/db";
import { normalizeCompanyName } from "@/platform/directory";

import { SEED_COMPANIES, type SeedCompany, type SeedContact } from "../data/companies";
import { seedId } from "../lib/ids";
import { ago } from "../lib/time";

import {
  byLead,
  companyId,
  contactIdsByCompany,
  marketOf,
  passed,
  websiteUrl,
  type LeadInfo,
  type Row,
} from "./base";

export interface DirectoryWorld {
  companies: Row<Prisma.CompanyUncheckedCreateInput>[];
  contacts: Row<Prisma.ContactUncheckedCreateInput>[];
  sourceRefs: Row<Prisma.CompanySourceRefUncheckedCreateInput>[];
  notes: Row<Prisma.NoteUncheckedCreateInput>[];
}

/** Sites last updated in 2014 or earlier have no working HTTPS (the web.ssl finding). */
export function lacksHttps(company: SeedCompany): boolean {
  return company.copyrightYear !== undefined && company.copyrightYear <= 2014;
}

export function firstSourceUrl(company: SeedCompany): string | null {
  switch (company.source) {
    case "google-places":
      return `https://maps.example.com/place/${company.placeId ?? String(company.n)}`;
    case "youtube-channels":
      return `https://youtube.example.com/channel/${company.channelId ?? String(company.n)}`;
    case "apple-app-store":
      return `https://apps.example.com/app/id${String(6_400_000_000 + company.n)}`;
    case "jobs-serpapi":
      return `https://jobs.example.com/posting/${String(90_000 + company.n)}`;
    case "csv-import":
    case "manual":
      return null;
  }
}

function presenceUrl(company: SeedCompany): string | null {
  if (company.websiteKind === "OWN_SITE") return websiteUrl(company);
  if (company.websiteKind === "MARKETPLACE_ONLY") {
    return `https://jiji.example.com/${company.city.toLowerCase().replaceAll(" ", "-")}/seller-${String(company.n)}`;
  }
  const socials = company.socials ?? {};
  return socials.instagram ?? socials.facebook ?? socials.youtube ?? null;
}

function field(
  source: string,
  collectedAt: Date,
  verified: boolean,
  sourceUrl?: string | null,
): FieldSources[string] {
  return {
    source,
    collectedAt: collectedAt.toISOString(),
    verified,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function contactRow(
  company: SeedCompany,
  contact: SeedContact,
  id: string,
  collectedAt: Date,
  now: Date,
): Row<Prisma.ContactUncheckedCreateInput> {
  if (contact.anonymized === true) {
    return {
      id,
      companyId: companyId(company.n),
      seniority: "UNKNOWN",
      emailStatus: "UNKNOWN",
      whatsappStatus: "UNKNOWN",
      source: "enrichment",
      collectedAt,
      fieldSources: {},
      isAnonymized: true,
      anonymizedAt: ago(now, { days: 20 }),
      createdAt: collectedAt,
    };
  }
  const verified =
    contact.emailStatus !== undefined &&
    contact.emailStatus !== "UNVERIFIED" &&
    contact.emailStatus !== "UNKNOWN";
  const verifiedAt = new Date(collectedAt.getTime() + 3_600_000);
  const source =
    company.source === "csv-import" || company.source === "manual" ? company.source : "enrichment";
  const sourceUrl =
    company.domain === null ? presenceUrl(company) : `https://${company.domain}/contact`;
  const fieldSources: FieldSources = {};
  if (contact.email !== undefined)
    fieldSources.email = field(source, collectedAt, verified, sourceUrl);
  if (contact.phone !== undefined)
    fieldSources.phone = field(source, collectedAt, false, sourceUrl);
  const name = [contact.first, contact.last].filter((part) => part !== undefined).join(" ");
  return {
    id,
    companyId: companyId(company.n),
    name: name === "" ? null : name,
    firstName: contact.first ?? null,
    lastName: contact.last ?? null,
    role: contact.role ?? null,
    seniority: contact.seniority,
    email: contact.email ?? null,
    emailStatus: contact.emailStatus ?? "UNVERIFIED",
    emailType: contact.emailType ?? null,
    emailVerifiedAt: verified ? verifiedAt : null,
    ...(verified
      ? {
          verifierFlags: VerifierFlagsSchema.parse({
            catchAll: contact.emailStatus === "RISKY",
            disposable: false,
            roleBased: contact.emailType === "ROLE",
            webmail: contact.email?.endsWith("@example.com") ?? false,
            mxFound: true,
            smtpCheck: contact.emailStatus === "VALID",
          }),
        }
      : {}),
    phone: contact.phone ?? null,
    whatsappStatus: contact.whatsapp ?? (contact.phone === undefined ? "UNKNOWN" : "NONE"),
    linkedinUrl: contact.linkedin ?? null,
    source,
    sourceUrl,
    collectedAt,
    // The UK sole trader who asked to be contacted (ConsentRecord in compliance.ts).
    lawfulBasis: company.n === 45 ? "CONSENT" : "LEGITIMATE_INTEREST_B2B",
    fieldSources: FieldSourcesSchema.parse(fieldSources),
    createdAt: collectedAt,
  };
}

export function buildDirectory(now: Date, leads: readonly LeadInfo[]): DirectoryWorld {
  const contactIds = contactIdsByCompany();
  const companies: DirectoryWorld["companies"] = [];
  const contacts: DirectoryWorld["contacts"] = [];
  const sourceRefs: DirectoryWorld["sourceRefs"] = [];

  for (const company of SEED_COMPANIES) {
    const own = leads.filter((lead) => lead.company.n === company.n);
    const oldest = Math.max(...own.map((lead) => lead.spec.age));
    const createdAt = ago(now, { days: oldest + 0.01 });
    const enriched = own.some((lead) => passed(lead, "ENRICHED"));
    const enrichedAt = new Date(createdAt.getTime() + 2 * 3_600_000);
    const website = presenceUrl(company);
    // A Places name can't be stored (INV-14): Places companies carry the name found on their own
    // site or profile, or the "Place <last 6>" placeholder until enrichment finds one.
    const placesOnly = company.name.startsWith("Place ");
    const nameSource = placesOnly
      ? "placeholder"
      : company.source === "google-places"
        ? "enrichment"
        : company.source;
    const fieldSources: FieldSources = { name: field(nameSource, createdAt, !placesOnly) };
    if (enriched && website !== null)
      fieldSources.website = field("enrichment", enrichedAt, true, website);
    if (company.phones.length > 0)
      fieldSources.phones = field("enrichment", enrichedAt, false, website);
    if (company.legalForm !== "UNKNOWN")
      fieldSources.legalForm = field(
        company.legalFormSource ?? "crawl-hint",
        enrichedAt,
        company.legalFormSource === "companies-house",
      );

    companies.push({
      id: companyId(company.n),
      name: company.name,
      normalizedName: normalizeCompanyName(company.name),
      normalizedDomain: company.domain,
      website,
      websiteKind: company.websiteKind,
      phones: company.phones,
      primaryPhone: company.phones[0] ?? null,
      country: company.country,
      city: company.city,
      region: company.region ?? null,
      market: marketOf(company),
      timezone: company.timezone,
      legalForm: company.legalForm,
      legalFormSource: company.legalForm === "UNKNOWN" ? null : (company.legalFormSource ?? null),
      legalFormConfidence:
        company.legalForm === "UNKNOWN"
          ? null
          : company.legalFormSource === "companies-house"
            ? 1
            : 0.8,
      industry: company.industry,
      sizeRange: company.size,
      socials: CompanySocialsSchema.parse(company.socials ?? {}),
      ...(enriched && company.domain !== null
        ? {
            techHints: TechHintsSchema.parse({
              platforms: company.platforms ?? [],
              legacyTech: (company.copyrightYear ?? 2026) <= 2015 ? ["table-layout"] : [],
              ...(company.copyrightYear === undefined
                ? {}
                : { copyrightYear: company.copyrightYear }),
              httpsAvailable: !lacksHttps(company),
            }),
          }
        : {}),
      copyrightYear: company.copyrightYear ?? null,
      crawlStatus: !enriched ? "NOT_STARTED" : company.domain === null ? "NO_WEBSITE" : "OK",
      lastCrawledAt: enriched && company.domain !== null ? enrichedAt : null,
      lastEnrichedAt: enriched ? enrichedAt : null,
      firstSource: company.source,
      firstSourceUrl: firstSourceUrl(company),
      collectedAt: createdAt,
      lawfulBasis: "LEGITIMATE_INTEREST_B2B",
      fieldSources: FieldSourcesSchema.parse(fieldSources),
      isActiveClient: company.isActiveClient === true,
      createdAt,
    });

    const ids = contactIds.get(company.n) ?? [];
    company.contacts.forEach((contact, index) => {
      const id = ids[index];
      if (id !== undefined)
        contacts.push(contactRow(company, contact, id, enriched ? enrichedAt : createdAt, now));
    });

    if (company.placeId !== undefined) {
      sourceRefs.push({
        id: seedId("csrc", sourceRefs.length + 1),
        companyId: companyId(company.n),
        adapterId: "google-places",
        externalId: company.placeId,
        url: `https://maps.example.com/place/${company.placeId}`,
        lastRefreshedAt: createdAt,
        createdAt,
      });
    }
    if (company.channelId !== undefined) {
      sourceRefs.push({
        id: seedId("csrc", sourceRefs.length + 1),
        companyId: companyId(company.n),
        adapterId: "youtube-channels",
        externalId: company.channelId,
        url: `https://youtube.example.com/channel/${company.channelId}`,
        lastRefreshedAt: createdAt,
        createdAt,
      });
    }
  }

  const note = (n: number, leadN: number, authorId: string, body: string, daysAgo: number) => {
    const lead = byLead(leads, leadN);
    return {
      id: seedId("note", n),
      authorId,
      module: "acquisition",
      targetType: "acquisition.lead",
      targetId: lead.id,
      companyId: lead.companyId,
      body,
      createdAt: ago(now, { days: daysAgo }),
    };
  };
  const notes = [
    note(
      1,
      16,
      byLead(leads, 16).ownerId,
      "Admissions page must be live before the next intake; the bursar signs off invoices.",
      14,
    ),
    note(
      2,
      50,
      byLead(leads, 50).ownerId,
      "Prefers WhatsApp calls in the afternoon. Bring printed samples of the label designs.",
      1,
    ),
    note(
      3,
      7,
      byLead(leads, 7).ownerId,
      "Borderline: a good fit, but the director rarely answers email. Try the lettings inbox.",
      5,
    ),
  ];

  return { companies, contacts, sourceRefs, notes };
}
