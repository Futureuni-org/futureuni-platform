import "server-only";

/**
 * Read model for the leads list (`[line]/leads`). There is no list-read service in
 * `@/modules/acquisition/core` (it owns only the lead state machine), so this `*.repo.ts` (allowed
 * by the DB-access naming rule) composes the list, its filter-option sets and the CSV export rows.
 * See CR-16-GAP-LEADS-LIST in phases/16/REQUESTS.md — the platform should grow a real lead-list
 * read service that this screen then calls instead.
 *
 * Scope is always by service line (the route is per line, and the page authorises the line before
 * calling here). The permission matrix makes `acquisition.lead.read` line-wide for every role, so
 * the list is not owner-scoped; ownership only limits which rows a member may act on (enforced by
 * the services behind each action).
 */

import {
  SEVERITY_ORDER,
  type Actor,
  type FindingSeverity,
  type LeadStatus,
  type Market,
  type ScoreBand,
  type ServiceLine,
} from "@/contracts/common";
import { audit } from "@/platform/audit-log";
import {
  afterClause,
  db,
  NEWEST_FIRST,
  paginate,
  withTransaction,
  type Prisma,
} from "@/platform/db";

import { STATUS_GROUPS, type LeadListFilter } from "./lead-filters";

export interface LeadListRow {
  id: string;
  createdAt: Date;
  companyName: string;
  city: string | null;
  country: string | null;
  market: Market;
  status: LeadStatus;
  score: number | null;
  scoreBand: ScoreBand | null;
  strongestFinding: string | null;
  owner: { id: string; name: string | null; image: string | null } | null;
  lastActivityAt: Date;
  nextActionAt: Date | null;
  nextActionNote: string | null;
  overdue: boolean;
  source: string;
  needsHumanReview: boolean;
  complianceReview: boolean;
  inCrossSellGroup: boolean;
}

/** A half-open range: from the start of the first day up to, but not including, `toExclusive`. */
function dateRange(from?: Date, toExclusive?: Date): Prisma.DateTimeFilter | undefined {
  if (from === undefined && toExclusive === undefined) return undefined;
  return {
    ...(from === undefined ? {} : { gte: from }),
    ...(toExclusive === undefined ? {} : { lt: toExclusive }),
  };
}

/**
 * Search text as a literal for `contains`. Prisma passes `%` and `_` through to SQL `LIKE` as
 * wildcards, so a search for "100%" or "a_b" would match far more than it says; a backslash makes
 * them literal.
 */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(serviceLine: ServiceLine, f: LeadListFilter): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [{ serviceLine }];

  if (f.q !== undefined) {
    const contains = { contains: likeLiteral(f.q), mode: "insensitive" } as const;
    and.push({
      OR: [
        { company: { name: contains } },
        { company: { normalizedDomain: contains } },
        {
          company: {
            contacts: { some: { deletedAt: null, OR: [{ name: contains }, { email: contains }] } },
          },
        },
      ],
    });
  }
  if (f.group !== undefined) and.push({ status: { in: [...STATUS_GROUPS[f.group].statuses] } });
  if (f.market !== undefined) and.push({ market: f.market });
  if (f.country !== undefined) and.push({ country: f.country });
  if (f.scoreMin !== undefined) and.push({ score: { gte: f.scoreMin } });
  if (f.scoreMax !== undefined) and.push({ score: { lte: f.scoreMax } });
  if (f.ownerId !== undefined) and.push({ ownerId: f.ownerId });
  if (f.source !== undefined) and.push({ company: { firstSource: f.source } });
  if (f.signalType !== undefined) and.push({ signals: { some: { signalType: f.signalType } } });
  if (f.flags.includes("needsReview")) and.push({ needsHumanReview: true });
  if (f.flags.includes("compliance")) and.push({ complianceReview: true });
  if (f.flags.includes("crossSell")) and.push({ crossSellGroupId: { not: null } });

  const range = dateRange(f.from, f.toExclusive);
  if (range !== undefined) {
    if (f.dateField === "created") and.push({ createdAt: range });
    else if (f.dateField === "updated") and.push({ updatedAt: range });
    else and.push({ lastActivityAt: range });
  }
  const next = dateRange(f.nextFrom, f.nextToExclusive);
  if (next !== undefined) and.push({ nextActionAt: next });

  return { AND: and };
}

type LeadListPayload = Prisma.LeadGetPayload<{ select: typeof LIST_SELECT }>;

const LIST_SELECT = {
  id: true,
  createdAt: true,
  market: true,
  status: true,
  country: true,
  score: true,
  scoreBand: true,
  lastActivityAt: true,
  nextActionAt: true,
  nextActionNote: true,
  needsHumanReview: true,
  complianceReview: true,
  crossSellGroupId: true,
  company: { select: { name: true, city: true, country: true, firstSource: true } },
  owner: { select: { id: true, name: true, image: true } },
} satisfies Prisma.LeadSelect;

/** The strongest (highest-severity) pitchable, non-dismissed finding claim per lead, batched. */
async function strongestFindings(leadIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, { claim: string; severity: FindingSeverity }>();
  if (leadIds.length === 0) return new Map();
  const findings = await db.auditFinding.findMany({
    where: { leadId: { in: leadIds }, dismissedAt: null, pitchable: true },
    select: { leadId: true, claim: true, severity: true },
  });
  for (const fnd of findings) {
    const current = out.get(fnd.leadId);
    if (
      current === undefined ||
      SEVERITY_ORDER.indexOf(fnd.severity) > SEVERITY_ORDER.indexOf(current.severity)
    ) {
      out.set(fnd.leadId, { claim: fnd.claim, severity: fnd.severity });
    }
  }
  return new Map([...out].map(([id, v]) => [id, v.claim]));
}

export interface ListLeadsInput {
  serviceLine: ServiceLine;
  filter: LeadListFilter;
  cursor?: string;
  limit?: number;
  now?: Date;
}

export async function listLeads(
  input: ListLeadsInput,
): Promise<{ items: LeadListRow[]; nextCursor: string | null }> {
  const now = input.now ?? new Date();
  const where = buildWhere(input.serviceLine, input.filter);

  const pageInput: { cursor?: string; limit?: number } = {};
  if (input.cursor !== undefined) pageInput.cursor = input.cursor;
  if (input.limit !== undefined) pageInput.limit = input.limit;

  const page = await paginate<LeadListPayload>(pageInput, ({ after, take }) =>
    db.lead.findMany({
      where: { AND: [where, afterClause(after)] },
      orderBy: [...NEWEST_FIRST],
      take,
      select: LIST_SELECT,
    }),
  );

  const strongest = await strongestFindings(page.items.map((l) => l.id));

  const items: LeadListRow[] = page.items.map((lead) => ({
    id: lead.id,
    createdAt: lead.createdAt,
    companyName: lead.company.name,
    city: lead.company.city,
    country: lead.country ?? lead.company.country,
    market: lead.market,
    status: lead.status,
    score: lead.score,
    scoreBand: lead.scoreBand,
    strongestFinding: strongest.get(lead.id) ?? null,
    owner: lead.owner,
    lastActivityAt: lead.lastActivityAt,
    nextActionAt: lead.nextActionAt,
    nextActionNote: lead.nextActionNote,
    overdue: lead.nextActionAt !== null && lead.nextActionAt.getTime() < now.getTime(),
    source: lead.company.firstSource,
    needsHumanReview: lead.needsHumanReview,
    complianceReview: lead.complianceReview,
    inCrossSellGroup: lead.crossSellGroupId !== null,
  }));

  return { items, nextCursor: page.nextCursor };
}

/** Total leads for the line (unfiltered) — the count shown in the PageHeader. */
export function countLeads(serviceLine: ServiceLine): Promise<number> {
  return db.lead.count({ where: { serviceLine } });
}

export interface LeadSuppressionTarget {
  serviceLine: ServiceLine;
  ownerId: string | null;
  email: string | null;
  domain: string | null;
}

/**
 * The primary contact email and company domain to suppress for a lead (bulk "add to suppression"),
 * with the lead's scope so the caller can authorise it. Null when the lead doesn't exist.
 */
export async function getLeadSuppressionTarget(
  leadId: string,
): Promise<LeadSuppressionTarget | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      serviceLine: true,
      ownerId: true,
      primaryContact: { select: { email: true } },
      company: { select: { normalizedDomain: true } },
    },
  });
  if (lead === null) return null;
  return {
    serviceLine: lead.serviceLine,
    ownerId: lead.ownerId,
    email: lead.primaryContact?.email ?? null,
    domain: lead.company.normalizedDomain,
  };
}

/**
 * The audit-log entry for a re-audit someone asked for, the one `rerunAudit` writes. The bulk
 * action queues the audit job instead of calling that service (it runs the audit inline), so it
 * records the request here to keep the same trail. See CR-16-GAP-BULK-JOBS.
 */
export async function recordReauditRequested(actor: Actor, leadId: string): Promise<void> {
  await withTransaction((tx) =>
    audit.record(tx, {
      actor,
      action: "acquisition.lead.reaudit",
      targetType: "Lead",
      targetId: leadId,
    }),
  );
}

/**
 * Distinct source adapters and signal types present for the line, for the filter selects. Grouped
 * in the database: Prisma's `distinct` reads every matching row and de-duplicates in memory.
 */
export async function listFilterOptions(
  serviceLine: ServiceLine,
): Promise<{ sources: string[]; signalTypes: string[] }> {
  const [companies, signals] = await Promise.all([
    db.company.groupBy({
      by: ["firstSource"],
      where: { leads: { some: { serviceLine } } },
      orderBy: { firstSource: "asc" },
      take: 100,
    }),
    db.signal.groupBy({
      by: ["signalType"],
      where: { serviceLine },
      orderBy: { signalType: "asc" },
      take: 100,
    }),
  ]);
  return {
    sources: companies.map((c) => c.firstSource).filter((s) => s !== ""),
    signalTypes: signals.map((s) => s.signalType),
  };
}

export interface LeadExportRow {
  id: string;
  company: string;
  domain: string | null;
  market: Market;
  status: LeadStatus;
  score: number | null;
  scoreBand: ScoreBand | null;
  owner: string | null;
  source: string;
  nextActionAt: Date | null;
  createdAt: Date;
}

/** The most rows one CSV export holds. A larger result is cut and reported as truncated. */
export const EXPORT_ROW_LIMIT = 5000;

/** The matching leads for a CSV export, newest first, cut at `EXPORT_ROW_LIMIT`. */
export async function listLeadsForExport(
  serviceLine: ServiceLine,
  filter: LeadListFilter,
): Promise<{ rows: LeadExportRow[]; truncated: boolean }> {
  // One extra row tells a full export from a cut one without a second count query.
  const found = await db.lead.findMany({
    where: buildWhere(serviceLine, filter),
    orderBy: [...NEWEST_FIRST],
    take: EXPORT_ROW_LIMIT + 1,
    select: {
      id: true,
      market: true,
      status: true,
      score: true,
      scoreBand: true,
      nextActionAt: true,
      createdAt: true,
      company: { select: { name: true, normalizedDomain: true, firstSource: true } },
      owner: { select: { name: true } },
    },
  });
  const rows = found.slice(0, EXPORT_ROW_LIMIT).map((lead) => ({
    id: lead.id,
    company: lead.company.name,
    domain: lead.company.normalizedDomain,
    market: lead.market,
    status: lead.status,
    score: lead.score,
    scoreBand: lead.scoreBand,
    owner: lead.owner?.name ?? null,
    source: lead.company.firstSource,
    nextActionAt: lead.nextActionAt,
    createdAt: lead.createdAt,
  }));
  return { rows, truncated: found.length > EXPORT_ROW_LIMIT };
}
