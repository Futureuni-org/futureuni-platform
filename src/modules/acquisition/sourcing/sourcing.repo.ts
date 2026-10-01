import "server-only";

import type {
  Actor,
  LeadStatus,
  Market,
  Page,
  ServiceLine,
} from "@/contracts/common";
import type {
  CsvAttestation,
  CrossLineHint,
  SearchRunCounts,
  SearchRunSourceResult,
} from "@/contracts/source-adapter";
import {
  afterClause,
  createOrOnConflict,
  db,
  NEWEST_FIRST,
  paginate,
  Prisma,
  toJsonInput,
  type Lead,
  type ProviderUsage,
  type SavedSearch,
  type SearchRun,
  type Signal,
  type Tx,
} from "@/platform/db";

/**
 * All database access for sourcing (Phase 8). Everything that reads or writes a `SearchRun`,
 * `SavedSearch`, `Signal`, `Lead` row or the `ProviderUsage` counter goes through here (DB access
 * lives only in `*.repo.ts`; project-rules §Conventions). Lead status changes still go through
 * `transitionLead`/`recordLeadCreation`, and companies/contacts through `@/platform/directory`.
 */

const OPEN_LEAD_EXCLUDED: readonly LeadStatus[] = ["WON", "LOST", "DISQUALIFIED", "SUPPRESSED"];

// ---------------------------------------------------------------------------------------------
// SearchRun
// ---------------------------------------------------------------------------------------------

export interface CreateSearchRunInput {
  serviceLine: ServiceLine;
  markets: Market[];
  spec: unknown;
  trigger: "MANUAL" | "SCHEDULED" | "CSV_IMPORT" | "MANUAL_ADD";
  actor: Actor;
  status?: "QUEUED" | "RUNNING";
  jobRunId?: string | null;
  savedSearchId?: string | null;
  estimatedCostMicros?: number | null;
  attestation?: CsvAttestation | null;
  csvFileId?: string | null;
  startedAt?: Date | null;
}

function actorColumns(actor: Actor): { actorType: "USER" | "SYSTEM"; actorId: string | null } {
  return actor.type === "USER"
    ? { actorType: "USER", actorId: actor.userId }
    : { actorType: "SYSTEM", actorId: null };
}

export function createSearchRun(tx: Tx, input: CreateSearchRunInput): Promise<SearchRun> {
  const { actorType, actorId } = actorColumns(input.actor);
  return tx.searchRun.create({
    data: {
      serviceLine: input.serviceLine,
      markets: input.markets,
      spec: toJsonInput(input.spec),
      trigger: input.trigger,
      status: input.status ?? "RUNNING",
      actorType,
      actorId,
      jobRunId: input.jobRunId ?? null,
      savedSearchId: input.savedSearchId ?? null,
      estimatedCostMicros: input.estimatedCostMicros ?? null,
      attestation: input.attestation === null || input.attestation === undefined
        ? Prisma.DbNull
        : toJsonInput(input.attestation),
      csvFileId: input.csvFileId ?? null,
      startedAt: input.startedAt ?? new Date(),
    },
  });
}

/** A run recorded as skipped (never executed), e.g. a scheduled run for a line at capacity. */
export function createSkippedSearchRun(
  tx: Tx,
  input: Omit<CreateSearchRunInput, "status" | "startedAt"> & { skipReason: string },
): Promise<SearchRun> {
  const { actorType, actorId } = actorColumns(input.actor);
  const now = new Date();
  return tx.searchRun.create({
    data: {
      serviceLine: input.serviceLine,
      markets: input.markets,
      spec: toJsonInput(input.spec),
      trigger: input.trigger,
      status: "SKIPPED",
      skipReason: input.skipReason,
      actorType,
      actorId,
      jobRunId: input.jobRunId ?? null,
      savedSearchId: input.savedSearchId ?? null,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
    },
  });
}

export interface SearchRunProgress {
  counts?: SearchRunCounts;
  perSource?: SearchRunSourceResult[];
  costMicros?: number;
}

/** Live update during a run (read by the Phase 15 run page). Uses the root client, not a tx. */
export function updateSearchRunProgress(id: string, progress: SearchRunProgress): Promise<SearchRun> {
  return db.searchRun.update({
    where: { id },
    data: {
      ...(progress.counts === undefined ? {} : { counts: toJsonInput(progress.counts) }),
      ...(progress.perSource === undefined ? {} : { perSource: toJsonInput(progress.perSource) }),
      ...(progress.costMicros === undefined ? {} : { costMicros: progress.costMicros }),
    },
  });
}

export interface FinishSearchRunInput {
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED";
  counts: SearchRunCounts;
  perSource: SearchRunSourceResult[];
  costMicros: number;
  durationMs: number;
  error?: string | null;
}

export function finishSearchRun(id: string, input: FinishSearchRunInput): Promise<SearchRun> {
  return db.searchRun.update({
    where: { id },
    data: {
      status: input.status,
      counts: toJsonInput(input.counts),
      perSource: toJsonInput(input.perSource),
      costMicros: input.costMicros,
      finishedAt: new Date(),
      durationMs: input.durationMs,
      error: input.error ?? null,
    },
  });
}

export function getSearchRun(id: string): Promise<SearchRun | null> {
  return db.searchRun.findUnique({ where: { id } });
}

export function getSearchRunWithLeads(
  id: string,
): Promise<(SearchRun & { signals: Signal[] }) | null> {
  return db.searchRun.findUnique({ where: { id }, include: { signals: true } });
}

export interface ListSearchRunsInput {
  serviceLine?: ServiceLine;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export function listSearchRuns(input: ListSearchRunsInput): Promise<Page<SearchRun>> {
  const where: Prisma.SearchRunWhereInput = {
    ...(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine }),
    ...(input.from === undefined && input.to === undefined
      ? {}
      : {
          createdAt: {
            ...(input.from === undefined ? {} : { gte: input.from }),
            ...(input.to === undefined ? {} : { lte: input.to }),
          },
        }),
  };
  return paginate(
    { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), ...(input.limit === undefined ? {} : { limit: input.limit }) },
    ({ after, take }) =>
      db.searchRun.findMany({
        where: { AND: [where, afterClause(after)] },
        orderBy: [...NEWEST_FIRST],
        take,
      }),
  );
}

export function markSearchRunCancelled(id: string): Promise<SearchRun> {
  return db.searchRun.update({
    where: { id },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------------------------

export interface CreateSignalInput {
  companyId: string;
  leadId?: string | null;
  serviceLine: ServiceLine;
  signalType: string;
  evidenceText: string;
  evidence?: Prisma.InputJsonValue | null;
  sourceUrl?: string | null;
  observedAt: Date;
  adapterId: string;
  searchRunId?: string | null;
  externalRef?: string | null;
  rawPayload?: Prisma.InputJsonValue | null;
  crossLineHint?: CrossLineHint | null;
}

function signalData(input: CreateSignalInput): Prisma.SignalUncheckedCreateInput {
  return {
    companyId: input.companyId,
    leadId: input.leadId ?? null,
    serviceLine: input.serviceLine,
    signalType: input.signalType,
    evidenceText: input.evidenceText,
    evidence: input.evidence ?? Prisma.DbNull,
    sourceUrl: input.sourceUrl ?? null,
    observedAt: input.observedAt,
    adapterId: input.adapterId,
    searchRunId: input.searchRunId ?? null,
    externalRef: input.externalRef ?? null,
    rawPayload: input.rawPayload ?? Prisma.DbNull,
    crossLineHint:
      input.crossLineHint === null || input.crossLineHint === undefined
        ? Prisma.DbNull
        : toJsonInput(input.crossLineHint),
  };
}

/**
 * Creates a signal. When it carries an `externalRef`, a re-run that finds the same provider item
 * for the same company, line and type attaches no duplicate: the partial-unique index
 * `acq_signals_external_dedupe_key` is caught and the existing signal is returned (`created: false`).
 */
export async function createSignalDeduped(
  tx: Tx,
  input: CreateSignalInput,
): Promise<{ signal: Signal; created: boolean }> {
  const externalRef = input.externalRef;
  if (externalRef === null || externalRef === undefined) {
    return { signal: await tx.signal.create({ data: signalData(input) }), created: true };
  }
  return createOrOnConflict<{ signal: Signal; created: boolean }>(
    tx,
    "acq_signals_external_dedupe_key",
    async () => ({ signal: await tx.signal.create({ data: signalData(input) }), created: true }),
    async () => {
      const existing = await tx.signal.findFirst({
        where: {
          companyId: input.companyId,
          serviceLine: input.serviceLine,
          signalType: input.signalType,
          adapterId: input.adapterId,
          externalRef,
        },
      });
      if (existing === null) {
        return { signal: await tx.signal.create({ data: signalData(input) }), created: true };
      }
      return { signal: existing, created: false };
    },
  );
}

/** Attach an already-stored signal to a lead (when a lead is created after the signal). */
export function attachSignalToLead(tx: Tx, signalId: string, leadId: string): Promise<Signal> {
  return tx.signal.update({ where: { id: signalId }, data: { leadId } });
}

// ---------------------------------------------------------------------------------------------
// Lead
// ---------------------------------------------------------------------------------------------

/** The open lead for a company on a line and market, if any (excludes closed statuses). */
export function findOpenLead(
  tx: Tx,
  where: { companyId: string; serviceLine: ServiceLine; market: Market },
): Promise<Lead | null> {
  return tx.lead.findFirst({
    where: { ...where, status: { notIn: [...OPEN_LEAD_EXCLUDED] } },
  });
}

/** A DISQUALIFIED or SUPPRESSED lead for this company on this line: the line is never reopened. */
export function findBlockingLead(
  tx: Tx,
  where: { companyId: string; serviceLine: ServiceLine },
): Promise<Lead | null> {
  return tx.lead.findFirst({
    where: { ...where, status: { in: ["DISQUALIFIED", "SUPPRESSED"] } },
    orderBy: { createdAt: "desc" },
  });
}

/** Open leads for the company on other lines (for the cross-line hint, Phase 11 cross-sell). */
export function findOpenLeadsOnOtherLines(
  tx: Tx,
  where: { companyId: string; serviceLine: ServiceLine },
): Promise<Lead[]> {
  return tx.lead.findMany({
    where: {
      companyId: where.companyId,
      serviceLine: { not: where.serviceLine },
      status: { notIn: [...OPEN_LEAD_EXCLUDED] },
    },
    orderBy: { createdAt: "asc" },
  });
}

export interface CreateLeadInput {
  companyId: string;
  serviceLine: ServiceLine;
  market: Market;
  country?: string | null;
  ownerId?: string | null;
}

/**
 * Creates a lead in NEW, or returns the existing open lead if a concurrent run created one first
 * (the `acq_leads_one_open` partial unique). The caller records the creation event
 * (`recordLeadCreation`) only when `created` is true.
 */
export function createLeadIfAbsent(
  tx: Tx,
  input: CreateLeadInput,
): Promise<{ lead: Lead; created: boolean }> {
  return createOrOnConflict<{ lead: Lead; created: boolean }>(
    tx,
    "acq_leads_one_open",
    async () => ({
      lead: await tx.lead.create({
        data: {
          companyId: input.companyId,
          serviceLine: input.serviceLine,
          market: input.market,
          country: input.country ?? null,
          ownerId: input.ownerId ?? null,
          status: "NEW",
        },
      }),
      created: true,
    }),
    async () => {
      const existing = await findOpenLead(tx, {
        companyId: input.companyId,
        serviceLine: input.serviceLine,
        market: input.market,
      });
      if (existing === null) {
        throw new Error("one-open-lead conflict without an open lead");
      }
      return { lead: existing, created: false };
    },
  );
}

// ---------------------------------------------------------------------------------------------
// ProviderUsage (daily per-provider counters)
// ---------------------------------------------------------------------------------------------

export function readProviderUsage(provider: string, day: Date): Promise<ProviderUsage | null> {
  return db.providerUsage.findUnique({ where: { provider_day: { provider, day } } });
}

/** Atomically add calls and cost to a provider's day, creating the row if needed. */
export function incrementProviderUsage(
  provider: string,
  day: Date,
  calls: number,
  costMicros: number,
  capHit: boolean,
): Promise<ProviderUsage> {
  return db.providerUsage.upsert({
    where: { provider_day: { provider, day } },
    create: { provider, day, calls, costMicros, capHit },
    update: {
      calls: { increment: calls },
      costMicros: { increment: costMicros },
      ...(capHit ? { capHit: true } : {}),
    },
  });
}

// ---------------------------------------------------------------------------------------------
// SavedSearch
// ---------------------------------------------------------------------------------------------

export interface CreateSavedSearchInput {
  name: string;
  serviceLine: ServiceLine;
  spec: unknown;
  cron: string;
  timezone: string;
  enabled: boolean;
  ownerId: string;
  nextRunAt?: Date | null;
}

export function createSavedSearch(input: CreateSavedSearchInput): Promise<SavedSearch> {
  return db.savedSearch.create({
    data: {
      name: input.name,
      serviceLine: input.serviceLine,
      spec: toJsonInput(input.spec),
      cron: input.cron,
      timezone: input.timezone,
      enabled: input.enabled,
      ownerId: input.ownerId,
      nextRunAt: input.nextRunAt ?? null,
    },
  });
}

export function getSavedSearch(id: string): Promise<SavedSearch | null> {
  return db.savedSearch.findUnique({ where: { id } });
}

export function updateSavedSearch(
  id: string,
  data: Prisma.SavedSearchUncheckedUpdateInput,
): Promise<SavedSearch> {
  return db.savedSearch.update({ where: { id }, data });
}

export function deleteSavedSearch(id: string): Promise<SavedSearch> {
  return db.savedSearch.delete({ where: { id } });
}

export function listSavedSearches(where: { serviceLine?: ServiceLine }): Promise<SavedSearch[]> {
  return db.savedSearch.findMany({
    where: where.serviceLine === undefined ? {} : { serviceLine: where.serviceLine },
    orderBy: { createdAt: "desc" },
  });
}

export function listEnabledSavedSearches(): Promise<SavedSearch[]> {
  return db.savedSearch.findMany({ where: { enabled: true } });
}

/** Aggregates signals by adapter for the source-stats service (Phase 17 analytics). */
export interface SourceStatRow {
  adapterId: string;
  found: number;
  companies: number;
  leads: number;
}

export async function getSourceStats(input: {
  serviceLine?: ServiceLine;
  from?: Date;
  to?: Date;
}): Promise<SourceStatRow[]> {
  const where: Prisma.SignalWhereInput = {
    ...(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine }),
    ...(input.from === undefined && input.to === undefined
      ? {}
      : {
          createdAt: {
            ...(input.from === undefined ? {} : { gte: input.from }),
            ...(input.to === undefined ? {} : { lte: input.to }),
          },
        }),
  };
  const rows = await db.signal.findMany({
    where,
    select: { adapterId: true, companyId: true, leadId: true },
  });
  const byAdapter = new Map<string, { found: number; companies: Set<string>; leads: Set<string> }>();
  for (const row of rows) {
    const entry =
      byAdapter.get(row.adapterId) ?? { found: 0, companies: new Set(), leads: new Set() };
    entry.found += 1;
    entry.companies.add(row.companyId);
    if (row.leadId !== null) entry.leads.add(row.leadId);
    byAdapter.set(row.adapterId, entry);
  }
  return [...byAdapter.entries()].map(([adapterId, entry]) => ({
    adapterId,
    found: entry.found,
    companies: entry.companies.size,
    leads: entry.leads.size,
  }));
}
