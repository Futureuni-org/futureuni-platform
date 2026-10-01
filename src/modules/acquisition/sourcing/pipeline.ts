import "server-only";

/**
 * The per-signal pipeline (Phase 8, source-adapter.md §1): for one `RawSignal` it normalises the
 * record, derives its market and country, checks suppression early (INV-2), matches or creates the
 * company in the shared directory (INV-10, INV-14), stores the `Signal`, and creates or attaches
 * the lead in `NEW` (INV-1, INV-15) — or records that the line can't be reopened. Shared by the
 * search runner and by the CSV-import and manual-add services.
 */

import type { Actor, Clock, Market, ServiceLine } from "@/contracts/common";
import type { CrossLineHint, RawSignal } from "@/contracts/source-adapter";
import { AppError } from "@/lib/errors";
import { recordLeadCreation, isSuppressed } from "@/modules/acquisition/core";
import { toJsonInput, withTransaction, type Tx } from "@/platform/db";
import {
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  upsertCompany,
  upsertContact,
  type DirectorySource,
} from "@/platform/directory";
import { publishAfterCommit } from "@/platform/events";

import { deriveMarket } from "./market";
import {
  attachSignalToLead,
  createLeadIfAbsent,
  createSignalDeduped,
  findBlockingLead,
  findOpenLead,
  findOpenLeadsOnOtherLines,
} from "./sourcing.repo";

export interface MutableCounts {
  fetched: number;
  outOfMarket: number;
  suppressed: number;
  companiesCreated: number;
  companiesMatched: number;
  leadsCreated: number;
  leadsUpdated: number;
  notReopened: number;
  errors: number;
}

export function emptyCounts(): MutableCounts {
  return {
    fetched: 0,
    outOfMarket: 0,
    suppressed: 0,
    companiesCreated: 0,
    companiesMatched: 0,
    leadsCreated: 0,
    leadsUpdated: 0,
    notReopened: 0,
    errors: 0,
  };
}

export interface PipelineContext {
  searchRunId: string;
  serviceLine: ServiceLine;
  /** Markets the run targets; a record deriving outside them is dropped and counted. */
  requestedMarkets: readonly Market[];
  /** The market the finding adapter was invoked for (fallback when a record has no country). */
  fallbackMarket: Market;
  actor: Actor;
  clock: Clock;
  counts: MutableCounts;
  /** Signal ids the line's profile declares, plus `manual_lead`; others are dropped (rule 14). */
  allowedSignalTypes: ReadonlySet<string>;
  /** The SearchSpec location, kept for a Places-only (transient) company (INV-14). */
  searchLocation?: { city?: string | null; region?: string | null } | null;
  /** The directory source id override (e.g. "manual:<userId>"); defaults to the adapter id. */
  sourceId?: string;
  /** Owner for a newly created lead (manual add sets the creator, module spec §2). */
  ownerId?: string | null;
  log: { warn(msg: string, data?: Record<string, unknown>): void };
}

function normalizedSuppressionCheck(raw: RawSignal): {
  email?: string;
  phone?: string;
  domain?: string;
  defaultCountry?: string;
} {
  const country = raw.country ?? raw.address?.country ?? undefined;
  const email = normalizeEmail(raw.email ?? raw.contact?.email);
  const phone = normalizePhone(raw.phone ?? raw.contact?.phone, country);
  const domain = normalizeDomain(raw.website);
  return {
    ...(email === null ? {} : { email }),
    ...(phone === null ? {} : { phone }),
    ...(domain === null ? {} : { domain }),
    ...(country === undefined ? {} : { defaultCountry: country }),
  };
}

/** Processes one RawSignal end to end, mutating `ctx.counts`. Never throws: errors are counted. */
export async function processRawSignal(raw: RawSignal, ctx: PipelineContext): Promise<void> {
  try {
    if (!ctx.allowedSignalTypes.has(raw.signalType)) {
      ctx.log.warn("dropping signal with an unknown type for this line", {
        signalType: raw.signalType,
        adapterId: raw.adapterId,
      });
      return;
    }

    // Market and country.
    const { country, market } = deriveMarket(
      {
        country: raw.country,
        phone: raw.phone ?? raw.contact?.phone,
        addressCountry: raw.address?.country,
        domain: normalizeDomain(raw.website),
      },
      ctx.fallbackMarket,
    );
    if (!ctx.requestedMarkets.includes(market)) {
      ctx.counts.outOfMarket += 1;
      return;
    }

    // Early suppression (INV-2): never create a company or lead for a suppressed contact.
    if (await isSuppressed(null, normalizedSuppressionCheck(raw))) {
      ctx.counts.suppressed += 1;
      return;
    }

    await withTransaction((tx) => runInTx(tx, raw, ctx, market, country));
  } catch (error) {
    ctx.counts.errors += 1;
    ctx.log.warn("failed to process a signal", {
      adapterId: raw.adapterId,
      signalType: raw.signalType,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

async function runInTx(
  tx: Tx,
  raw: RawSignal,
  ctx: PipelineContext,
  market: Market,
  country: string | null,
): Promise<void> {
  const source: DirectorySource = {
    id: ctx.sourceId ?? raw.adapterId,
    url: raw.sourceUrl ?? null,
    lawfulBasis: "LEGITIMATE_INTEREST_B2B",
  };

  const phone = raw.phone ?? undefined;
  const company = await upsertCompany(
    tx,
    {
      name: raw.companyName,
      website: raw.website ?? null,
      phones: phone === undefined ? [] : [phone],
      primaryPhone: phone ?? null,
      city: raw.address?.city ?? null,
      region: raw.address?.region ?? null,
      addressLine: raw.address?.line ?? null,
      postcode: raw.address?.postcode ?? null,
      country: country ?? raw.address?.country ?? null,
      market,
      socials: raw.socials ?? null,
      externalRef:
        raw.externalRef === undefined
          ? null
          : { adapterId: raw.externalRef.adapterId, externalId: raw.externalRef.externalId, url: raw.sourceUrl ?? null },
      searchLocation: ctx.searchLocation ?? null,
    },
    source,
    { clock: ctx.clock },
  );
  if (company.created) ctx.counts.companiesCreated += 1;
  else ctx.counts.companiesMatched += 1;

  // A contact the record carries (CSV / manual only).
  if (raw.contact !== undefined) {
    await upsertContact(
      tx,
      company.record.id,
      {
        name: raw.contact.name ?? null,
        role: raw.contact.role ?? null,
        email: raw.contact.email ?? null,
        phone: raw.contact.phone ?? null,
      },
      source,
      { clock: ctx.clock },
    );
  }

  // Cross-line awareness: an open lead on another line becomes a hint (Phase 11 cross-sell).
  const otherLeads = await findOpenLeadsOnOtherLines(tx, {
    companyId: company.record.id,
    serviceLine: ctx.serviceLine,
  });
  const otherLead = otherLeads[0];
  const crossLineHint: CrossLineHint | null =
    otherLead === undefined
      ? null
      : {
          otherLeadId: otherLead.id,
          otherServiceLine: otherLead.serviceLine,
          otherStatus: otherLead.status,
        };

  // Decide the lead the signal attaches to.
  const blocking = await findBlockingLead(tx, {
    companyId: company.record.id,
    serviceLine: ctx.serviceLine,
  });
  const noReopen = blocking !== null || company.record.isActiveClient;

  let leadId: string | null = null;
  let newlyCreatedLead = false;
  let existingOpenLead = false;
  if (!noReopen) {
    const open = await findOpenLead(tx, {
      companyId: company.record.id,
      serviceLine: ctx.serviceLine,
      market,
    });
    if (open !== null) {
      leadId = open.id;
      existingOpenLead = true;
    } else {
      const created = await createLeadIfAbsent(tx, {
        companyId: company.record.id,
        serviceLine: ctx.serviceLine,
        market,
        country,
        ownerId: ctx.ownerId ?? null,
      });
      leadId = created.lead.id;
      newlyCreatedLead = created.created;
      existingOpenLead = !created.created;
    }
  }

  const signal = await createSignalDeduped(tx, {
    companyId: company.record.id,
    leadId,
    serviceLine: ctx.serviceLine,
    signalType: raw.signalType,
    evidenceText: raw.evidenceText,
    evidence: raw.evidence === undefined ? null : toJsonInput(raw.evidence),
    sourceUrl: raw.sourceUrl ?? null,
    observedAt: new Date(raw.observedAt),
    adapterId: raw.adapterId,
    searchRunId: ctx.searchRunId,
    externalRef: raw.externalRef?.externalId ?? null,
    rawPayload: raw.rawPayload === undefined ? null : toJsonInput(raw.rawPayload),
    crossLineHint,
  });

  // A signal that already existed (re-run) attaches nothing new.
  if (!signal.created) {
    if (noReopen) ctx.counts.notReopened += 1;
    return;
  }

  if (leadId !== null && signal.signal.leadId === null) {
    await attachSignalToLead(tx, signal.signal.id, leadId);
  }

  if (noReopen) {
    ctx.counts.notReopened += 1;
  } else if (newlyCreatedLead && leadId !== null) {
    await recordLeadCreation(tx, {
      leadId,
      actor: ctx.actor,
      reason: `sourcing:${raw.adapterId}`,
      meta: { searchRunId: ctx.searchRunId, signalType: raw.signalType },
    });
    ctx.counts.leadsCreated += 1;
    await publishAfterCommit(tx, {
      name: "lead.created",
      actor: ctx.actor,
      payload: {
        leadId,
        companyId: company.record.id,
        serviceLine: ctx.serviceLine,
        market,
        source: source.id,
        searchRunId: ctx.searchRunId,
      },
    });
  } else if (existingOpenLead) {
    ctx.counts.leadsUpdated += 1;
  }

  await publishAfterCommit(tx, {
    name: "signal.recorded",
    actor: ctx.actor,
    payload: {
      signalId: signal.signal.id,
      companyId: company.record.id,
      leadId,
      serviceLine: ctx.serviceLine,
      signalType: raw.signalType,
    },
  });
}

/** Builds the AppError thrown when a record can't make a company (missing name). */
export function invalidRecord(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}
