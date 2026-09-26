/**
 * Factories for the shared directory: Company, CompanySourceRef, Contact and Note.
 * These insert rows directly (for test setup); product code writes the directory only through
 * @/platform/directory (upsertCompany, upsertContact).
 */

import type { Company, CompanySourceRef, Contact, Note, Prisma, Tx } from "@/platform/db";

import { createUser } from "./core";
import { seq, uniqueDomain, uniqueEmail, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

/** A Nigerian company with its own website by default. `market` follows `country` unless given. */
export function buildCompany(
  overrides: Input<Prisma.CompanyUncheckedCreateInput> = {},
): Prisma.CompanyUncheckedCreateInput {
  const n = seq();
  const domain = uniqueDomain("company");
  const country = overrides.country ?? "NG";
  return {
    name: `Company ${String(n)}`,
    normalizedName: `company ${String(n)}`,
    normalizedDomain: domain,
    website: `https://${domain}`,
    websiteKind: "OWN_SITE",
    country,
    city: country === "NG" ? "Lagos" : "London",
    market: country === "NG" ? "NIGERIA" : "INTERNATIONAL",
    firstSource: "test",
    ...overrides,
  };
}
export function createCompany(
  tx: Tx,
  overrides: Input<Prisma.CompanyUncheckedCreateInput> = {},
): Promise<Company> {
  return tx.company.create({ data: buildCompany(overrides) });
}

export function buildCompanySourceRef(
  overrides: Input<Prisma.CompanySourceRefUncheckedCreateInput> & { companyId: string },
): Prisma.CompanySourceRefUncheckedCreateInput {
  return { adapterId: "google-places", externalId: `ChIJ${uniqueToken()}`, ...overrides };
}
export async function createCompanySourceRef(
  tx: Tx,
  overrides: Input<Prisma.CompanySourceRefUncheckedCreateInput> = {},
): Promise<CompanySourceRef> {
  const companyId = overrides.companyId ?? (await createCompany(tx)).id;
  return tx.companySourceRef.create({ data: buildCompanySourceRef({ ...overrides, companyId }) });
}

export function buildContact(
  overrides: Input<Prisma.ContactUncheckedCreateInput> & { companyId: string },
): Prisma.ContactUncheckedCreateInput {
  const n = seq();
  return {
    name: `Contact ${String(n)}`,
    firstName: "Contact",
    lastName: String(n),
    role: "Owner",
    seniority: "OWNER",
    email: uniqueEmail("contact"),
    emailType: "PERSONAL",
    emailStatus: "VALID",
    source: "test",
    ...overrides,
  };
}
export async function createContact(
  tx: Tx,
  overrides: Input<Prisma.ContactUncheckedCreateInput> = {},
): Promise<Contact> {
  const companyId = overrides.companyId ?? (await createCompany(tx)).id;
  return tx.contact.create({ data: buildContact({ ...overrides, companyId }) });
}

export function buildNote(
  overrides: Input<Prisma.NoteUncheckedCreateInput> & { authorId: string },
): Prisma.NoteUncheckedCreateInput {
  return {
    module: "acquisition",
    targetType: "acquisition.lead",
    targetId: `lead-${uniqueToken()}`,
    body: "Called the owner; call back next week.",
    ...overrides,
  };
}
export async function createNote(
  tx: Tx,
  overrides: Input<Prisma.NoteUncheckedCreateInput> = {},
): Promise<Note> {
  const authorId = overrides.authorId ?? (await createUser(tx)).id;
  return tx.note.create({ data: buildNote({ ...overrides, authorId }) });
}
