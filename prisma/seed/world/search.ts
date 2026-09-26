/**
 * Saved searches, search runs and signals (data-model §10.6). Every lead has at least one signal
 * with a source; audited leads also have a signal derived from their first finding. Signals from
 * Google Places carry no raw payload (INV-14).
 */

import type { Market, ServiceLine } from "@/contracts/common";
import {
  CrossLineHintSchema,
  CsvAttestationSchema,
  SearchRunCountsSchema,
  SearchRunSourceResultSchema,
  SearchSpecSchema,
  type SearchRunSourceResult,
  type SearchSpec,
  type SourceAdapterId,
} from "@/contracts/source-adapter";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { ALL_LINES } from "../data/users";
import { seedId } from "../lib/ids";
import { fixtureInfo } from "../lib/storage";
import { ago, fromNow } from "../lib/time";

import type { SeedFile } from "./audits";
import { byLead, userId, websiteUrl, type LeadInfo, type Row } from "./base";
import { firstSourceUrl } from "./directory";

export interface SearchWorld {
  savedSearches: Row<Prisma.SavedSearchUncheckedCreateInput>[];
  /** Written after the runs exist (a saved search and its last run reference each other). */
  savedSearchLastRuns: { savedSearchId: string; lastRunId: string; lastRunAt: Date }[];
  searchRuns: Row<Prisma.SearchRunUncheckedCreateInput>[];
  signals: Row<Prisma.SignalUncheckedCreateInput>[];
  files: SeedFile[];
}

const LEAD_OF_LINE = {
  WEB_DEVELOPMENT: "webLead",
  UI_UX_DESIGN: "uiuxLead",
  GRAPHIC_DESIGN: "graphicLead",
  VIDEO_EDITING: "videoLead",
} as const;

const KEYWORDS: Readonly<Record<ServiceLine, readonly string[]>> = {
  WEB_DEVELOPMENT: ["restaurants", "clinics", "schools"],
  UI_UX_DESIGN: ["fintech app", "booking app"],
  GRAPHIC_DESIGN: ["bakery", "fashion", "hotels"],
  VIDEO_EDITING: ["cooking channel", "comedy", "vlog"],
};

const SOURCES: Readonly<Record<ServiceLine, readonly SourceAdapterId[]>> = {
  WEB_DEVELOPMENT: ["google-places", "jobs-serpapi"],
  UI_UX_DESIGN: ["apple-app-store", "jobs-serpapi"],
  GRAPHIC_DESIGN: ["google-places", "jobs-serpapi"],
  VIDEO_EDITING: ["youtube-channels", "jobs-serpapi"],
};

const LOCATION = {
  NIGERIA: { market: "NIGERIA", text: "Lagos", city: "Lagos", country: "NG" },
  INTERNATIONAL: {
    market: "INTERNATIONAL",
    text: "Manchester, UK",
    city: "Manchester",
    country: "GB",
  },
} as const;

function spec(
  line: ServiceLine,
  markets: readonly Market[],
  sources: readonly SourceAdapterId[],
  limit = 50,
): SearchSpec {
  return SearchSpecSchema.parse({
    serviceLine: line,
    markets,
    locations: markets.map((market) => LOCATION[market]),
    keywords: KEYWORDS[line],
    sources,
    limit,
  });
}

const ADAPTER_SIGNAL: Record<ServiceLine, Partial<Record<SourceAdapterId, string>>> = {
  WEB_DEVELOPMENT: { "jobs-serpapi": "job_post_web_developer" },
  UI_UX_DESIGN: {
    "apple-app-store": "app_reviews_usability_complaints",
    "jobs-serpapi": "job_post_product_designer",
  },
  GRAPHIC_DESIGN: { "google-places": "new_business", "jobs-serpapi": "job_post_graphic_designer" },
  VIDEO_EDITING: { "youtube-channels": "active_creator", "jobs-serpapi": "job_post_video_editor" },
};

/** The signal a finding's check implies (the audit-derived signals of each profile). */
const DERIVED_SIGNAL: Readonly<Record<string, string>> = {
  "web.pagespeed_mobile": "slow_mobile",
  "web.ssl": "no_ssl",
  "web.mobile_viewport": "not_mobile_friendly",
  "uiux.onboarding_capture": "high_friction_signup",
  "uiux.accessibility": "accessibility_failures",
  "uiux.heuristics": "inconsistent_ui",
  "graphic.consistency": "inconsistent_branding",
  "graphic.logo_quality": "low_quality_visuals",
  "video.captions": "no_captions",
  "video.thumbnails": "inconsistent_thumbnails",
};

interface PrimarySignal {
  adapterId: string;
  signalType: string;
  sourceUrl: string | null;
  externalRef: string | null;
  evidenceText: string;
  detectedBy: string | null;
}

function primarySignal(lead: LeadInfo): PrimarySignal {
  const { company } = lead;
  const line = lead.spec.line;
  const source = company.source;
  if (source === "csv-import" || source === "manual") {
    return {
      adapterId: source,
      signalType: "manual_lead",
      sourceUrl: null,
      externalRef: null,
      evidenceText:
        source === "manual" ? "Added by hand from a referral" : "Imported from an attested CSV",
      detectedBy: null,
    };
  }
  if (line === "WEB_DEVELOPMENT" && company.domain === null && source === "google-places") {
    return {
      adapterId: source,
      signalType: "no_website",
      sourceUrl: firstSourceUrl(company),
      externalRef: company.placeId ?? null,
      evidenceText: "The Google Maps listing has no website.",
      detectedBy: null,
    };
  }
  if (line === "VIDEO_EDITING" && company.socials?.youtube !== undefined) {
    const quiet = lead.n % 3 === 0;
    return {
      adapterId: "youtube-channels",
      signalType: quiet ? "gone_quiet" : "active_creator",
      sourceUrl: company.socials.youtube,
      externalRef: company.channelId ?? company.socials.youtube.split("/").at(-1) ?? null,
      evidenceText: quiet
        ? "No uploads in the last 30 days after a weekly schedule."
        : "Uploads every week; 20 videos in the last 5 months.",
      detectedBy: null,
    };
  }
  const signalType = ADAPTER_SIGNAL[line][source];
  if (signalType !== undefined) {
    const jobs = signalType.startsWith("job_post_");
    return {
      adapterId: source,
      signalType,
      sourceUrl: jobs
        ? `https://jobs.example.com/posting/${String(90_000 + company.n)}-${String(lead.n)}`
        : firstSourceUrl(company),
      externalRef: jobs
        ? `job-${String(company.n)}-${String(lead.n)}`
        : (company.placeId ?? `app-${String(company.n)}`),
      evidenceText: jobs
        ? `Job post: ${signalType.replace("job_post_", "").replaceAll("_", " ")} (full-time)`
        : signalType === "new_business"
          ? "The Google Maps listing is less than a year old."
          : "Recent App Store reviews mention usability problems.",
      detectedBy: null,
    };
  }
  if (line === "WEB_DEVELOPMENT" && company.domain !== null) {
    return {
      adapterId: "enrichment",
      signalType: "outdated_site",
      sourceUrl: websiteUrl(company),
      externalRef: null,
      evidenceText: `The footer says © ${String(company.copyrightYear ?? 2015)}; the layout isn't responsive.`,
      detectedBy: "enrichment",
    };
  }
  return {
    adapterId: "manual",
    signalType: "manual_lead",
    sourceUrl: null,
    externalRef: null,
    evidenceText: "Added by hand after a referral",
    detectedBy: null,
  };
}

/** Which seeded run found a lead's primary signal (null when it came from elsewhere). */
function runFor(line: ServiceLine, market: Market, adapterId: string): number | null {
  if (adapterId === "csv-import") return 9;
  if (adapterId === "manual")
    return line === "UI_UX_DESIGN" ? 11 : line === "WEB_DEVELOPMENT" ? 10 : null;
  switch (line) {
    case "WEB_DEVELOPMENT":
      if (adapterId === "google-places") return market === "NIGERIA" ? 1 : 12;
      return adapterId === "jobs-serpapi" ? 2 : null;
    case "UI_UX_DESIGN":
      return adapterId === "apple-app-store" || adapterId === "jobs-serpapi"
        ? market === "NIGERIA"
          ? 3
          : 4
        : null;
    case "GRAPHIC_DESIGN":
      return adapterId === "google-places" || adapterId === "jobs-serpapi" ? 6 : null;
    case "VIDEO_EDITING":
      return adapterId === "youtube-channels" ? (market === "NIGERIA" ? 7 : 8) : null;
  }
}

interface RunPlan {
  n: number;
  line: ServiceLine;
  markets: Market[];
  trigger: "MANUAL" | "SCHEDULED" | "CSV_IMPORT" | "MANUAL_ADD";
  status: "SUCCEEDED" | "PARTIAL" | "SKIPPED";
  daysAgo: number;
  savedSearch?: number;
  sources: SourceAdapterId[];
  failedSource?: SourceAdapterId;
}

const RUNS: readonly RunPlan[] = [
  {
    n: 1,
    line: "WEB_DEVELOPMENT",
    markets: ["NIGERIA"],
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    daysAgo: 21,
    savedSearch: 1,
    sources: ["google-places", "jobs-serpapi"],
  },
  {
    n: 2,
    line: "WEB_DEVELOPMENT",
    markets: ["NIGERIA", "INTERNATIONAL"],
    trigger: "MANUAL",
    status: "PARTIAL",
    daysAgo: 16,
    sources: ["google-places", "jobs-serpapi"],
    failedSource: "jobs-serpapi",
  },
  {
    n: 3,
    line: "UI_UX_DESIGN",
    markets: ["NIGERIA"],
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    daysAgo: 19,
    savedSearch: 3,
    sources: ["apple-app-store", "jobs-serpapi"],
  },
  {
    n: 4,
    line: "UI_UX_DESIGN",
    markets: ["INTERNATIONAL"],
    trigger: "MANUAL",
    status: "SUCCEEDED",
    daysAgo: 23,
    sources: ["apple-app-store", "jobs-serpapi"],
  },
  {
    n: 5,
    line: "GRAPHIC_DESIGN",
    markets: ["NIGERIA"],
    trigger: "SCHEDULED",
    status: "SKIPPED",
    daysAgo: 1,
    savedSearch: 5,
    sources: ["google-places", "jobs-serpapi"],
  },
  {
    n: 6,
    line: "GRAPHIC_DESIGN",
    markets: ["NIGERIA", "INTERNATIONAL"],
    trigger: "MANUAL",
    status: "SUCCEEDED",
    daysAgo: 26,
    sources: ["google-places", "jobs-serpapi"],
  },
  {
    n: 7,
    line: "VIDEO_EDITING",
    markets: ["NIGERIA"],
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    daysAgo: 18,
    savedSearch: 7,
    sources: ["youtube-channels"],
  },
  {
    n: 8,
    line: "VIDEO_EDITING",
    markets: ["INTERNATIONAL"],
    trigger: "MANUAL",
    status: "SUCCEEDED",
    daysAgo: 27,
    sources: ["youtube-channels"],
  },
  {
    n: 9,
    line: "WEB_DEVELOPMENT",
    markets: ["INTERNATIONAL"],
    trigger: "CSV_IMPORT",
    status: "SUCCEEDED",
    daysAgo: 24,
    sources: ["csv-import"],
  },
  {
    n: 10,
    line: "WEB_DEVELOPMENT",
    markets: ["INTERNATIONAL"],
    trigger: "MANUAL_ADD",
    status: "SUCCEEDED",
    daysAgo: 12,
    sources: ["manual"],
  },
  {
    n: 11,
    line: "UI_UX_DESIGN",
    markets: ["NIGERIA", "INTERNATIONAL"],
    trigger: "MANUAL_ADD",
    status: "SUCCEEDED",
    daysAgo: 33,
    sources: ["manual"],
  },
  {
    n: 12,
    line: "WEB_DEVELOPMENT",
    markets: ["INTERNATIONAL"],
    trigger: "SCHEDULED",
    status: "SUCCEEDED",
    daysAgo: 30,
    savedSearch: 2,
    sources: ["google-places"],
  },
];

/** File ids: screenshots count up from 1; the CSV, proposal and handoff PDFs use fixed ranges. */
export const CSV_FILE_N = 900;

/** Search runs link to JobRuns 1–12 (platform.ts creates them). */
export const searchJobRunId = (n: number): string => seedId("jobr", n);

const COST_PER_CALL: Partial<Record<SourceAdapterId, number>> = {
  "google-places": 32_000,
  "jobs-serpapi": 15_000,
  "youtube-channels": 0,
  "apple-app-store": 0,
};

export function buildSearch(
  now: Date,
  leads: readonly LeadInfo[],
  firstFindings: ReadonlyMap<
    number,
    { checkId: string; claim: string; sourceUrl: string | null; capturedAt: Date }
  >,
): SearchWorld {
  const signals: SearchWorld["signals"] = [];
  const signalsByRun = new Map<number, Set<string>>();

  for (const lead of leads) {
    const primary = primarySignal(lead);
    const run = runFor(lead.spec.line, lead.market, primary.adapterId);
    if (run !== null) signalsByRun.set(run, (signalsByRun.get(run) ?? new Set()).add(lead.id));
    const hint =
      lead.n === KEY_LEADS.crossSellHeld
        ? CrossLineHintSchema.parse({
            otherLeadId: byLead(leads, KEY_LEADS.crossSellLeader).id,
            otherServiceLine: "WEB_DEVELOPMENT",
            otherStatus: "IN_REVIEW",
          })
        : null;
    signals.push({
      id: seedId("sign", signals.length + 1),
      companyId: lead.companyId,
      leadId: lead.id,
      serviceLine: lead.spec.line,
      signalType: primary.signalType,
      evidenceText: primary.evidenceText,
      sourceUrl: primary.sourceUrl,
      observedAt: new Date(lead.createdAt.getTime() - 3_600_000),
      adapterId: primary.adapterId,
      detectedBy: primary.detectedBy,
      searchRunId: run === null ? null : seedId("srun", run),
      externalRef: primary.externalRef,
      ...(hint === null ? {} : { crossLineHint: toJsonInput(hint) }),
      createdAt: lead.createdAt,
    });

    const finding = firstFindings.get(lead.n);
    const derived = finding === undefined ? undefined : DERIVED_SIGNAL[finding.checkId];
    const derivedUrl =
      finding?.sourceUrl ?? websiteUrl(lead.company) ?? firstSourceUrl(lead.company);
    if (
      finding !== undefined &&
      derived !== undefined &&
      derived !== primary.signalType &&
      derivedUrl !== null
    ) {
      signals.push({
        id: seedId("sign", signals.length + 1),
        companyId: lead.companyId,
        leadId: lead.id,
        serviceLine: lead.spec.line,
        signalType: derived,
        evidenceText: finding.claim,
        sourceUrl: derivedUrl,
        observedAt: finding.capturedAt,
        adapterId: "audit",
        detectedBy: `audit:${finding.checkId}`,
        createdAt: finding.capturedAt,
      });
    }
  }

  // ---- Saved searches: two per line, one scheduled on weekdays at 09:00 WAT, one paused ----
  const savedSearches: SearchWorld["savedSearches"] = [];
  const savedSearchLastRuns: SearchWorld["savedSearchLastRuns"] = [];
  ALL_LINES.forEach((line, index) => {
    const owner = userId(LEAD_OF_LINE[line]);
    const enabledN = index * 2 + 1;
    const pausedN = index * 2 + 2;
    const tomorrowNine = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8),
    );
    savedSearches.push(
      {
        id: seedId("svsr", enabledN),
        name: `${line === "WEB_DEVELOPMENT" ? "Lagos businesses without a good site" : line === "UI_UX_DESIGN" ? "Nigerian apps with poor reviews" : line === "GRAPHIC_DESIGN" ? "New Lagos businesses" : "Nigerian creators"} (weekdays)`,
        serviceLine: line,
        spec: toJsonInput(spec(line, ["NIGERIA"], SOURCES[line])),
        cron: "0 9 * * 1-5",
        timezone: "Africa/Lagos",
        enabled: true,
        ownerId: owner,
        nextRunAt: tomorrowNine,
        ...(line === "GRAPHIC_DESIGN" ? { lastCapacitySkipNotifiedAt: ago(now, { days: 1 }) } : {}),
        createdAt: ago(now, { days: 40 }),
      },
      {
        id: seedId("svsr", pausedN),
        name: `${line === "WEB_DEVELOPMENT" ? "UK high streets" : line === "UI_UX_DESIGN" ? "UK and US product teams" : line === "GRAPHIC_DESIGN" ? "UK independents" : "UK and US channels"} (paused)`,
        serviceLine: line,
        spec: toJsonInput(spec(line, ["INTERNATIONAL"], SOURCES[line])),
        cron: "0 10 * * 1",
        timezone: "Europe/London",
        enabled: false,
        ownerId: owner,
        pausedReason: "Paused by the owner while the Nigerian pipeline catches up",
        createdAt: ago(now, { days: 45 }),
      },
    );
  });

  // ---- Runs ----
  const files: SeedFile[] = [];
  const csvFileId = seedId("file", CSV_FILE_N);
  const csvKey = "seed/imports/uk-high-street-leads.csv";
  const searchRuns = RUNS.map((plan): Row<Prisma.SearchRunUncheckedCreateInput> => {
    const startedAt = ago(now, { days: plan.daysAgo });
    const durationMs = plan.status === "SKIPPED" ? 40 : 38_000 + plan.n * 4_100;
    const found = signalsByRun.get(plan.n)?.size ?? 0;
    const perSource: SearchRunSourceResult[] = plan.sources.flatMap((adapterId) =>
      plan.markets.map((market) => {
        const failed = plan.failedSource === adapterId;
        const calls = plan.status === "SKIPPED" ? 0 : failed ? 1 : 3;
        return SearchRunSourceResultSchema.parse({
          adapterId,
          market,
          status: plan.status === "SKIPPED" ? "SKIPPED" : failed ? "FAILED" : "DONE",
          fetched: plan.status === "SKIPPED" || failed ? 0 : 12 + plan.n,
          calls,
          costMicros: calls * (COST_PER_CALL[adapterId] ?? 0),
          ...(failed ? { error: "The provider returned 503 twice; retried and gave up" } : {}),
        });
      }),
    );
    const fetched = perSource.reduce((sum, result) => sum + result.fetched, 0);
    const costMicros = perSource.reduce((sum, result) => sum + result.costMicros, 0);
    const counts = SearchRunCountsSchema.parse({
      fetched,
      outOfMarket: plan.status === "SKIPPED" ? 0 : 2,
      suppressed: plan.n === 1 ? 1 : 0,
      companiesCreated: found,
      companiesMatched: plan.status === "SKIPPED" ? 0 : 3,
      leadsCreated: found,
      leadsUpdated: plan.status === "SKIPPED" ? 0 : 1,
      notReopened: plan.n === 6 ? 1 : 0,
      errors: plan.failedSource === undefined ? 0 : 1,
    });
    const row: Row<Prisma.SearchRunUncheckedCreateInput> = {
      id: seedId("srun", plan.n),
      serviceLine: plan.line,
      markets: plan.markets,
      spec: toJsonInput(
        spec(plan.line, plan.markets, plan.sources, plan.trigger === "MANUAL_ADD" ? 1 : 50),
      ),
      trigger: plan.trigger,
      status: plan.status,
      skipReason: plan.status === "SKIPPED" ? "capacity" : null,
      savedSearchId: plan.savedSearch === undefined ? null : seedId("svsr", plan.savedSearch),
      actorType: plan.trigger === "SCHEDULED" ? "SYSTEM" : "USER",
      actorId: plan.trigger === "SCHEDULED" ? null : userId(LEAD_OF_LINE[plan.line]),
      jobRunId: searchJobRunId(plan.n),
      counts: toJsonInput(counts),
      perSource: toJsonInput(perSource),
      costMicros,
      estimatedCostMicros: plan.status === "SKIPPED" ? null : costMicros + 16_000,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + durationMs),
      durationMs,
      error:
        plan.failedSource === undefined
          ? null
          : `${plan.failedSource} failed; the other sources finished`,
      createdAt: startedAt,
    };
    if (plan.trigger === "CSV_IMPORT") {
      const uploader = userId("webLead");
      row.csvFileId = csvFileId;
      row.attestation = toJsonInput(
        CsvAttestationSchema.parse({
          statement: "I confirm this data was not purchased and was collected lawfully.",
          attestedById: uploader,
          attestedAt: startedAt.toISOString(),
          fileObjectId: csvFileId,
          rowCount: 3,
        }),
      );
      files.push({
        fixture: "importCsv",
        row: {
          id: csvFileId,
          key: csvKey,
          purpose: "CSV_IMPORT",
          access: "PRIVATE",
          ...fixtureInfo("importCsv"),
          uploadedById: uploader,
          module: "acquisition",
          retentionUntil: fromNow(startedAt, { days: 90 }),
          createdAt: startedAt,
        },
      });
    }
    return row;
  });

  for (const plan of RUNS) {
    if (plan.savedSearch === undefined) continue;
    savedSearchLastRuns.push({
      savedSearchId: seedId("svsr", plan.savedSearch),
      lastRunId: seedId("srun", plan.n),
      lastRunAt: ago(now, { days: plan.daysAgo }),
    });
  }

  return { savedSearches, savedSearchLastRuns, searchRuns, signals, files };
}
