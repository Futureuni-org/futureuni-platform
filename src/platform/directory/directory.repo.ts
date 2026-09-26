import "server-only";

import type { Company, Contact, Prisma, Tx } from "@/platform/db";

/**
 * The directory's queries. Reads go through the soft-delete-scoped client, so deleted companies
 * and contacts never match. Callers pass the transaction they run in.
 */

export async function findCompanyBySourceRef(
  tx: Tx,
  ref: { adapterId: string; externalId: string },
): Promise<Company | null> {
  const found = await tx.companySourceRef.findUnique({
    where: { adapterId_externalId: { adapterId: ref.adapterId, externalId: ref.externalId } },
    select: { company: true },
  });
  // Relation reads aren't soft-delete scoped: a deleted company never matches.
  return found !== null && found.company.deletedAt === null ? found.company : null;
}

export function findCompanyByDomain(tx: Tx, normalizedDomain: string): Promise<Company | null> {
  // findFirst, not findUnique: the domain index is partial (live rows only).
  return tx.company.findFirst({ where: { normalizedDomain }, orderBy: { createdAt: "asc" } });
}

export function findCompanyByPhones(tx: Tx, phones: readonly string[]): Promise<Company | null> {
  return tx.company.findFirst({
    where: {
      OR: [{ phones: { hasSome: [...phones] } }, { primaryPhone: { in: [...phones] } }],
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The most similar company name in the same city (pg_trgm). `%` uses the trigram index with
 * PostgreSQL's default threshold (0.3); the explicit similarity filter then applies ours.
 */
export async function findCompanyIdByNameAndCity(
  tx: Tx,
  normalizedName: string,
  city: string,
  threshold: number,
): Promise<{ id: string; score: number } | null> {
  const rows = await tx.$queryRaw<{ id: string; score: number }[]>`
    SELECT id, similarity("normalizedName", ${normalizedName})::float8 AS score
    FROM companies
    WHERE "deletedAt" IS NULL
      AND lower(city) = lower(${city})
      AND "normalizedName" % ${normalizedName}
      AND similarity("normalizedName", ${normalizedName}) >= ${threshold}
    ORDER BY score DESC, "createdAt" ASC
    LIMIT 1`;
  return rows[0] ?? null;
}

export function getCompany(tx: Tx, id: string): Promise<Company | null> {
  return tx.company.findFirst({ where: { id } });
}

export function createCompany(tx: Tx, data: Prisma.CompanyUncheckedCreateInput): Promise<Company> {
  return tx.company.create({ data });
}

export function updateCompany(
  tx: Tx,
  id: string,
  data: Prisma.CompanyUncheckedUpdateInput,
): Promise<Company> {
  return tx.company.update({ where: { id }, data });
}

export async function upsertCompanySourceRef(
  tx: Tx,
  ref: { companyId: string; adapterId: string; externalId: string; url: string | null; now: Date },
): Promise<void> {
  await tx.companySourceRef.upsert({
    where: { adapterId_externalId: { adapterId: ref.adapterId, externalId: ref.externalId } },
    create: {
      companyId: ref.companyId,
      adapterId: ref.adapterId,
      externalId: ref.externalId,
      url: ref.url,
      lastRefreshedAt: ref.now,
    },
    update: { lastRefreshedAt: ref.now, ...(ref.url === null ? {} : { url: ref.url }) },
  });
}

/** A contact of the company, matched by email, then phone, then exact name (case-insensitive). */
export async function findContact(
  tx: Tx,
  companyId: string,
  keys: { email: string | null; phone: string | null; name: string | null },
): Promise<Contact | null> {
  if (keys.email !== null) {
    const byEmail = await tx.contact.findFirst({ where: { companyId, email: keys.email } });
    if (byEmail !== null) return byEmail;
  }
  if (keys.phone !== null) {
    const byPhone = await tx.contact.findFirst({
      where: { companyId, phone: keys.phone },
      orderBy: { createdAt: "asc" },
    });
    if (byPhone !== null) return byPhone;
  }
  if (keys.name !== null) {
    return tx.contact.findFirst({
      where: { companyId, name: { equals: keys.name, mode: "insensitive" }, isAnonymized: false },
      orderBy: { createdAt: "asc" },
    });
  }
  return null;
}

export function createContact(tx: Tx, data: Prisma.ContactUncheckedCreateInput): Promise<Contact> {
  return tx.contact.create({ data });
}

export function updateContact(
  tx: Tx,
  id: string,
  data: Prisma.ContactUncheckedUpdateInput,
): Promise<Contact> {
  return tx.contact.update({ where: { id }, data });
}
