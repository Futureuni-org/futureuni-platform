/**
 * Factories for profiles, search, signals, leads, audits, scoring, cross-sell and capacity
 * (prisma/schema/acquisition.prisma, first half).
 */

import {
  toJsonInput,
  type Audit,
  type AuditCacheEntry,
  type AuditCheckRun,
  type AuditFinding,
  type CrossSellGroup,
  type Lead,
  type LeadEvent,
  type LineCapacityState,
  type Prisma,
  type SavedSearch,
  type ScoreReview,
  type SearchRun,
  type ServiceLineProfileVersion,
  type Signal,
  type Tx,
} from "@/platform/db";
import type { LeadStatus, Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import { INITIAL_PROFILES } from "../../prisma/seed/data/profiles";

import { createUser } from "./core";
import { createCompany } from "./directory";
import { FIXED_NOW, daysAgo, seq, uniqueDomain, uniqueInt, uniqueToken } from "./sequence";

type Input<T> = Partial<T>;

const AGENT_FOR_LINE = {
  WEB_DEVELOPMENT: "audit.web",
  UI_UX_DESIGN: "audit.uiux",
  GRAPHIC_DESIGN: "audit.graphic",
  VIDEO_EDITING: "audit.video",
} as const satisfies Record<ServiceLine, string>;

const CHECK_FOR_LINE = {
  WEB_DEVELOPMENT: "web.pagespeed_mobile",
  UI_UX_DESIGN: "uiux.accessibility",
  GRAPHIC_DESIGN: "graphic.consistency",
  VIDEO_EDITING: "video.captions",
} as const satisfies Record<ServiceLine, string>;

/** A valid ServiceLineProfile for a line (a copy of the seeded §3.3 placeholder). */
export function buildValidProfile(line: ServiceLine = "WEB_DEVELOPMENT"): ServiceLineProfile {
  return structuredClone(INITIAL_PROFILES[line]);
}

// ---- Profiles ----------------------------------------------------------------------------------

/** A published, inactive version by default, so any number can coexist with the seeded active one. */
export function buildProfileVersion(
  overrides: Input<Prisma.ServiceLineProfileVersionUncheckedCreateInput> & { createdById: string },
): Prisma.ServiceLineProfileVersionUncheckedCreateInput {
  const serviceLine = overrides.serviceLine ?? "WEB_DEVELOPMENT";
  return {
    serviceLine,
    version: uniqueInt(),
    status: "PUBLISHED",
    isActive: false,
    profile: toJsonInput(buildValidProfile(serviceLine)),
    note: "test version",
    ...overrides,
  };
}
export async function createProfileVersion(
  tx: Tx,
  overrides: Input<Prisma.ServiceLineProfileVersionUncheckedCreateInput> = {},
): Promise<ServiceLineProfileVersion> {
  const createdById = overrides.createdById ?? (await createUser(tx, { role: "SERVICE_LEAD" })).id;
  return tx.serviceLineProfileVersion.create({
    data: buildProfileVersion({ ...overrides, createdById }),
  });
}

// ---- Search -----------------------------------------------------------------------------------

function searchSpec(serviceLine: ServiceLine, market: Market) {
  return {
    serviceLine,
    markets: [market],
    locations: [
      market === "NIGERIA"
        ? { market, text: "Lagos", city: "Lagos", country: "NG" }
        : { market, text: "Manchester, UK", city: "Manchester", country: "GB" },
    ],
    keywords: ["restaurants"],
    limit: 50,
  };
}

export function buildSavedSearch(
  overrides: Input<Prisma.SavedSearchUncheckedCreateInput> & { ownerId: string },
): Prisma.SavedSearchUncheckedCreateInput {
  const serviceLine = overrides.serviceLine ?? "WEB_DEVELOPMENT";
  return {
    name: `Saved search ${String(seq())}`,
    serviceLine,
    spec: searchSpec(serviceLine, "NIGERIA"),
    cron: "0 9 * * 1-5",
    timezone: "Africa/Lagos",
    ...overrides,
  };
}
export async function createSavedSearch(
  tx: Tx,
  overrides: Input<Prisma.SavedSearchUncheckedCreateInput> = {},
): Promise<SavedSearch> {
  const ownerId = overrides.ownerId ?? (await createUser(tx, { role: "SERVICE_LEAD" })).id;
  return tx.savedSearch.create({ data: buildSavedSearch({ ...overrides, ownerId }) });
}

export function buildSearchRun(
  overrides: Input<Prisma.SearchRunUncheckedCreateInput> = {},
): Prisma.SearchRunUncheckedCreateInput {
  const serviceLine = overrides.serviceLine ?? "WEB_DEVELOPMENT";
  return {
    serviceLine,
    markets: ["NIGERIA"],
    spec: searchSpec(serviceLine, "NIGERIA"),
    trigger: "MANUAL",
    status: "SUCCEEDED",
    actorType: "SYSTEM",
    counts: {
      fetched: 10,
      outOfMarket: 0,
      suppressed: 0,
      companiesCreated: 6,
      companiesMatched: 4,
      leadsCreated: 6,
      leadsUpdated: 1,
      notReopened: 0,
      errors: 0,
    },
    perSource: [],
    costMicros: 32_000,
    startedAt: daysAgo(1),
    finishedAt: daysAgo(1),
    ...overrides,
  };
}
export function createSearchRun(
  tx: Tx,
  overrides: Input<Prisma.SearchRunUncheckedCreateInput> = {},
): Promise<SearchRun> {
  return tx.searchRun.create({ data: buildSearchRun(overrides) });
}

export function buildSignal(
  overrides: Input<Prisma.SignalUncheckedCreateInput> & { companyId: string },
): Prisma.SignalUncheckedCreateInput {
  return {
    serviceLine: "WEB_DEVELOPMENT",
    signalType: "no_website",
    evidenceText: "Google Maps listing has no website field.",
    sourceUrl: `https://maps.example.com/place/${uniqueToken()}`,
    observedAt: daysAgo(2),
    adapterId: "google-places",
    ...overrides,
  };
}
export async function createSignal(
  tx: Tx,
  overrides: Input<Prisma.SignalUncheckedCreateInput> = {},
): Promise<Signal> {
  const companyId = overrides.companyId ?? (await createCompany(tx)).id;
  return tx.signal.create({ data: buildSignal({ ...overrides, companyId }) });
}

// ---- Leads ------------------------------------------------------------------------------------

export function buildLead(
  overrides: Input<Prisma.LeadUncheckedCreateInput> & { companyId: string },
): Prisma.LeadUncheckedCreateInput {
  const market = overrides.market ?? "NIGERIA";
  return {
    serviceLine: "WEB_DEVELOPMENT",
    market,
    country: market === "NIGERIA" ? "NG" : "GB",
    status: "NEW",
    ...overrides,
  };
}
/** A NEW lead on its own new company (so the one-open-lead index never collides). */
export async function createLead(
  tx: Tx,
  overrides: Input<Prisma.LeadUncheckedCreateInput> = {},
): Promise<Lead> {
  const market = overrides.market ?? "NIGERIA";
  const companyId =
    overrides.companyId ??
    (await createCompany(tx, { country: market === "NIGERIA" ? "NG" : "GB" })).id;
  return tx.lead.create({ data: buildLead({ ...overrides, market, companyId }) });
}

const CLOSED: readonly LeadStatus[] = ["WON", "LOST", "DISQUALIFIED", "SUPPRESSED"];
const SCORED_OR_LATER: readonly LeadStatus[] = [
  "SCORED",
  "IN_REVIEW",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "WON",
];

/**
 * A lead already in `status`, with the fields that status implies: a score from SCORED on,
 * `nurtureReason` for NURTURE (default CAPACITY), `disqualifyReason` for DISQUALIFIED, `closedAt`
 * for closed statuses and `firstContactedAt` once contacted. No LeadEvent trail: use it to set up
 * tests of what happens next.
 */
export function createLeadInStatus(
  tx: Tx,
  status: LeadStatus,
  overrides: Input<Prisma.LeadUncheckedCreateInput> = {},
): Promise<Lead> {
  const contacted = [
    "CONTACTED",
    "REPLIED",
    "MEETING_BOOKED",
    "PROPOSAL_SENT",
    "WON",
    "LOST",
  ].includes(status);
  return createLead(tx, {
    status,
    ...(SCORED_OR_LATER.includes(status)
      ? { score: 72, scoreBand: "QUALIFIED" as const, scoredAt: daysAgo(5) }
      : {}),
    ...(status === "NURTURE" ? { nurtureReason: "CAPACITY" as const } : {}),
    ...(status === "DISQUALIFIED" ? { disqualifyReason: "low_score" } : {}),
    ...(CLOSED.includes(status) ? { closedAt: daysAgo(1) } : {}),
    ...(contacted ? { firstContactedAt: daysAgo(10) } : {}),
    ...overrides,
  });
}

export function buildLeadEvent(
  overrides: Input<Prisma.LeadEventUncheckedCreateInput> & { leadId: string },
): Prisma.LeadEventUncheckedCreateInput {
  return {
    kind: "STATUS_CHANGE",
    fromStatus: null,
    toStatus: "NEW",
    actorType: "SYSTEM",
    actorLabel: "acquisition.test",
    ...overrides,
  };
}
export async function createLeadEvent(
  tx: Tx,
  overrides: Input<Prisma.LeadEventUncheckedCreateInput> = {},
): Promise<LeadEvent> {
  const leadId = overrides.leadId ?? (await createLead(tx)).id;
  return tx.leadEvent.create({ data: buildLeadEvent({ ...overrides, leadId }) });
}

// ---- Audits and findings ------------------------------------------------------------------------

export function buildAudit(
  overrides: Input<Prisma.AuditUncheckedCreateInput> & { leadId: string; companyId: string },
): Prisma.AuditUncheckedCreateInput {
  const serviceLine = overrides.serviceLine ?? "WEB_DEVELOPMENT";
  return {
    agentId: AGENT_FOR_LINE[serviceLine],
    serviceLine,
    status: "SUCCEEDED",
    attempt: 1,
    startedAt: daysAgo(3),
    finishedAt: daysAgo(3),
    costMicros: 2_400,
    ...overrides,
  };
}
export async function createAudit(
  tx: Tx,
  overrides: Input<Prisma.AuditUncheckedCreateInput> = {},
): Promise<Audit> {
  const lead =
    overrides.leadId === undefined
      ? await createLead(tx)
      : await tx.lead.findUniqueOrThrow({ where: { id: overrides.leadId } });
  return tx.audit.create({
    data: buildAudit({
      ...overrides,
      leadId: lead.id,
      companyId: overrides.companyId ?? lead.companyId,
    }),
  });
}

export function buildAuditCheckRun(
  overrides: Input<Prisma.AuditCheckRunUncheckedCreateInput> & { auditId: string },
): Prisma.AuditCheckRunUncheckedCreateInput {
  return {
    checkId: "web.pagespeed_mobile",
    status: "OK",
    durationMs: 4_200,
    costMicros: 0,
    ...overrides,
  };
}
export async function createAuditCheckRun(
  tx: Tx,
  overrides: Input<Prisma.AuditCheckRunUncheckedCreateInput> = {},
): Promise<AuditCheckRun> {
  const auditId = overrides.auditId ?? (await createAudit(tx)).id;
  return tx.auditCheckRun.create({ data: buildAuditCheckRun({ ...overrides, auditId }) });
}

/** A measured, pitchable finding with a source URL (INV-18). */
export function buildAuditFinding(
  overrides: Input<Prisma.AuditFindingUncheckedCreateInput> & {
    auditId: string;
    leadId: string;
    companyId: string;
  },
): Prisma.AuditFindingUncheckedCreateInput {
  return {
    checkId: "web.pagespeed_mobile",
    severity: "HIGH",
    claim: "Your homepage took 7.2s to show its main content on mobile in our test on 3 Oct 2026.",
    evidence: { metrics: { lcpSeconds: 7.2, performanceScore: 34 }, thresholds: { lcpSeconds: 4 } },
    sourceUrl: `https://pagespeed.web.dev/analysis?url=https%3A%2F%2F${uniqueDomain("site")}`,
    capturedAt: daysAgo(3),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
    ...overrides,
  };
}
export async function createAuditFinding(
  tx: Tx,
  overrides: Input<Prisma.AuditFindingUncheckedCreateInput> = {},
): Promise<AuditFinding> {
  const audit =
    overrides.auditId === undefined
      ? await createAudit(tx, {
          ...(overrides.leadId === undefined ? {} : { leadId: overrides.leadId }),
          ...(overrides.companyId === undefined ? {} : { companyId: overrides.companyId }),
        })
      : await tx.audit.findUniqueOrThrow({ where: { id: overrides.auditId } });
  return tx.auditFinding.create({
    data: buildAuditFinding({
      ...overrides,
      auditId: audit.id,
      leadId: audit.leadId,
      companyId: audit.companyId,
    }),
  });
}

export function buildAuditCacheEntry(
  overrides: Input<Prisma.AuditCacheEntryUncheckedCreateInput> = {},
): Prisma.AuditCacheEntryUncheckedCreateInput {
  const domain = uniqueDomain("cached");
  return {
    cacheKey: `${domain}:web.pagespeed_mobile`,
    domain,
    checkId: "web.pagespeed_mobile",
    result: { lcpSeconds: 7.2, performanceScore: 34 },
    capturedAt: FIXED_NOW,
    expiresAt: new Date(FIXED_NOW.getTime() + 7 * 86_400_000),
    ...overrides,
  };
}
export function createAuditCacheEntry(
  tx: Tx,
  overrides: Input<Prisma.AuditCacheEntryUncheckedCreateInput> = {},
): Promise<AuditCacheEntry> {
  return tx.auditCacheEntry.create({ data: buildAuditCacheEntry(overrides) });
}

/**
 * A lead in `status` (default AUDITED) with one completed audit for its line, a check run and a
 * pitchable finding.
 */
export async function createLeadWithAudit(
  tx: Tx,
  options: {
    serviceLine?: ServiceLine;
    market?: Market;
    status?: LeadStatus;
    lead?: Input<Prisma.LeadUncheckedCreateInput>;
  } = {},
): Promise<{ lead: Lead; audit: Audit; finding: AuditFinding; checkRun: AuditCheckRun }> {
  const serviceLine = options.serviceLine ?? "WEB_DEVELOPMENT";
  const lead = await createLeadInStatus(tx, options.status ?? "AUDITED", {
    serviceLine,
    market: options.market ?? "NIGERIA",
    ...options.lead,
  });
  const audit = await createAudit(tx, { leadId: lead.id, companyId: lead.companyId, serviceLine });
  const checkId = CHECK_FOR_LINE[serviceLine];
  const checkRun = await createAuditCheckRun(tx, { auditId: audit.id, checkId });
  const finding = await createAuditFinding(tx, { auditId: audit.id, checkId });
  return { lead, audit, finding, checkRun };
}

// ---- Scoring, cross-sell and capacity -------------------------------------------------------------

export function buildScoreReview(
  overrides: Input<Prisma.ScoreReviewUncheckedCreateInput> & { leadId: string },
): Prisma.ScoreReviewUncheckedCreateInput {
  return {
    recommendation: "QUALIFY",
    confidence: 0.72,
    reasons: ["Slow mobile site with a clear owner contact"],
    ...overrides,
  };
}
export async function createScoreReview(
  tx: Tx,
  overrides: Input<Prisma.ScoreReviewUncheckedCreateInput> = {},
): Promise<ScoreReview> {
  const leadId = overrides.leadId ?? (await createLeadInStatus(tx, "SCORED")).id;
  return tx.scoreReview.create({ data: buildScoreReview({ ...overrides, leadId }) });
}

export function buildCrossSellGroup(
  overrides: Input<Prisma.CrossSellGroupUncheckedCreateInput> & { companyId: string },
): Prisma.CrossSellGroupUncheckedCreateInput {
  return { status: "ACTIVE", detectedAt: daysAgo(1), ...overrides };
}
export async function createCrossSellGroup(
  tx: Tx,
  overrides: Input<Prisma.CrossSellGroupUncheckedCreateInput> = {},
): Promise<CrossSellGroup> {
  const companyId = overrides.companyId ?? (await createCompany(tx)).id;
  return tx.crossSellGroup.create({ data: buildCrossSellGroup({ ...overrides, companyId }) });
}

/** One row per line: upserted, since the seed may already hold the line's state. */
export function upsertLineCapacityState(
  tx: Tx,
  overrides: Input<Prisma.LineCapacityStateUncheckedCreateInput> & { serviceLine: ServiceLine },
): Promise<LineCapacityState> {
  return tx.lineCapacityState.upsert({
    where: { serviceLine: overrides.serviceLine },
    create: { mode: "NORMAL", ...overrides },
    update: { mode: overrides.mode ?? "NORMAL" },
  });
}
