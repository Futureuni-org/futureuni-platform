import "server-only";

/**
 * `runSearch` (Phase 8): runs a service line's configured source adapters for a `SearchSpec`,
 * turns every result into a company/signal/lead through the shared pipeline, and records exactly
 * what happened in a `SearchRun`. One adapter failing never fails the run (it finishes `PARTIAL`).
 */

import type { Actor, Clock, ServiceLine } from "@/contracts/common";
import type { JobLogger } from "@/contracts/jobs";
import {
  SearchSpecSchema,
  type SearchRunCounts,
  type SearchRunSourceResult,
  type SearchSpec,
} from "@/contracts/source-adapter";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { resolveProviderKey } from "@/platform/credentials";
import { db, type SearchRun } from "@/platform/db";
import { publish } from "@/platform/events";
import { safeFetch } from "@/platform/http";
import { notify } from "@/platform/notifications";

import { SOURCING_RUN_COMPLETED } from "./notifications";

import { RunBudget } from "./budget";
import { loadProviderDailyRemaining, platformDay, TokenBucket } from "./limiter";
import { emptyCounts, processRawSignal, type MutableCounts, type PipelineContext } from "./pipeline";
import { resolvePlan, type AdapterInvocation } from "./resolve";
import { getSourcingSetting } from "./settings";
import {
  createSearchRun,
  finishSearchRun,
  incrementProviderUsage,
  updateSearchRunProgress,
} from "./sourcing.repo";
import type { SourceContext } from "@/contracts/source-adapter";

const NOOP_LOGGER: JobLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface RunSearchOptions {
  actor: Actor;
  jobRunId?: string;
  clock?: Clock;
  trigger?: "MANUAL" | "SCHEDULED" | "CSV_IMPORT" | "MANUAL_ADD";
  savedSearchId?: string | null;
  /** The job's AbortSignal, so cancelJob stops the run between calls. */
  signal?: AbortSignal;
  log?: JobLogger;
  /** Who to notify when the run finishes (the saved-search owner for scheduled runs). */
  notifyUserId?: string | null;
}

async function loadProfile(line: ServiceLine): Promise<ServiceLineProfile | null> {
  // Imported lazily to keep @/modules/acquisition/profiles out of this module's static graph
  // (the acquisition manifest ↔ profiles circular import is order-sensitive at load time).
  const { getActiveProfile } = await import("@/modules/acquisition/profiles");
  try {
    return await getActiveProfile(line);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

function countsSnapshot(counts: MutableCounts): SearchRunCounts {
  return { ...counts };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const current = index++;
      if (current >= items.length) return;
      const item = items[current];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

export async function runSearch(rawSpec: unknown, options: RunSearchOptions): Promise<SearchRun> {
  const spec: SearchSpec = SearchSpecSchema.parse(rawSpec);
  const { actor, clock = { now: () => new Date() }, log = NOOP_LOGGER } = options;

  await assertActorCan(actor, "acquisition.search.run", { serviceLine: spec.serviceLine });

  const [maxCalls, maxCostMicros, providerDailyCostCapMicros, concurrency] = await Promise.all([
    getSourcingSetting("maxProviderCallsPerRun"),
    getSourcingSetting("maxCostMicrosPerRun"),
    getSourcingSetting("providerDailyCostCapMicros"),
    getSourcingSetting("concurrency"),
  ]);

  const profile = await loadProfile(spec.serviceLine);
  const plan = resolvePlan(spec, profile);

  const searchRun = await createSearchRun(db, {
    serviceLine: spec.serviceLine,
    markets: spec.markets,
    spec,
    trigger: options.trigger ?? "MANUAL",
    actor,
    status: "RUNNING",
    jobRunId: options.jobRunId ?? null,
    savedSearchId: options.savedSearchId ?? null,
    startedAt: clock.now(),
  });

  const counts = emptyCounts();
  const budget = new RunBudget({ maxCalls, maxCostMicros });
  const started = Date.now();

  // Seed the per-provider daily snapshot for every paid provider used in this run.
  const providers = new Set(
    plan.invocations
      .map((i) => i.adapter.requiresCredential)
      .filter((p): p is NonNullable<typeof p> => p !== null),
  );
  for (const provider of providers) {
    const perDay = plan.invocations.find((i) => i.adapter.requiresCredential === provider)?.adapter
      .rateLimit.perDay ?? null;
    budget.registerProvider(
      provider,
      await loadProviderDailyRemaining(provider, perDay, providerDailyCostCapMicros, clock),
    );
  }

  const perSource: SearchRunSourceResult[] = plan.invocations.map((inv) => ({
    adapterId: inv.adapter.id,
    market: inv.market,
    status: "QUEUED",
    fetched: 0,
    calls: 0,
    costMicros: 0,
  }));

  const worker = async (entry: { inv: AdapterInvocation; index: number }): Promise<void> => {
    const { inv, index } = entry;
    const result = perSource[index];
    if (result === undefined) return;
    result.status = "RUNNING";
    const bucket = new TokenBucket(inv.adapter.rateLimit.perSecond);
    const providerView = budget.viewFor(inv.adapter.requiresCredential);
    let calls = 0;
    let cost = 0;

    const ctx: SourceContext = {
      searchRunId: searchRun.id,
      serviceLine: spec.serviceLine,
      market: inv.market,
      location: inv.location,
      keywords: inv.keywords,
      limit: inv.limitShare,
      actor,
      clock,
      signal: options.signal ?? new AbortController().signal,
      budget: {
        tryCharge: (c, m) => {
          const ok = providerView.tryCharge(c, m);
          if (ok) {
            calls += c;
            cost += m;
          }
          return ok;
        },
        remaining: () => providerView.remaining(),
      },
      resolveKey: (p) => resolveProviderKey(p),
      safeFetch,
      log: {
        info: (m, d) => {
          log.info(m, d);
        },
        warn: (m, d) => {
          log.warn(m, d);
        },
      },
    };

    const pctx: PipelineContext = {
      searchRunId: searchRun.id,
      serviceLine: spec.serviceLine,
      requestedMarkets: spec.markets,
      fallbackMarket: inv.market,
      actor,
      clock,
      counts,
      allowedSignalTypes: plan.allowedSignalTypes,
      searchLocation: { city: inv.location.city ?? null, region: inv.location.region ?? null },
      log,
    };

    try {
      for await (const raw of inv.adapter.search(inv.params, ctx)) {
        if (counts.fetched >= spec.limit || (options.signal?.aborted ?? false)) break;
        await bucket.acquire();
        counts.fetched += 1;
        result.fetched += 1;
        await processRawSignal(raw, pctx);
      }
      result.status = providerView.lastCappedReason() === null ? "DONE" : "CAPPED";
      const capped = providerView.lastCappedReason();
      if (capped !== null) result.cappedReason = capped;
    } catch (error) {
      result.status = "FAILED";
      result.error = error instanceof Error ? error.message.slice(0, 500) : "unknown error";
      log.warn("source adapter failed", { adapterId: inv.adapter.id, error: result.error });
    } finally {
      result.calls = calls;
      result.costMicros = cost;
      await updateSearchRunProgress(searchRun.id, {
        counts: countsSnapshot(counts),
        perSource,
        costMicros: budget.totalCostMicros(),
      }).catch(() => undefined);
    }
  };

  await runWithConcurrency(
    plan.invocations.map((inv, index) => ({ inv, index })),
    concurrency,
    worker,
  );

  // Persist each provider's usage so parallel and later runs see it (the daily caps).
  const day = platformDay(clock.now());
  for (const usage of budget.usage()) {
    await incrementProviderUsage(usage.provider, day, usage.calls, usage.costMicros, usage.capHit).catch(
      () => undefined,
    );
  }

  const status = perSource.some((r) => r.status === "FAILED") ? "PARTIAL" : "SUCCEEDED";
  const finished = await finishSearchRun(searchRun.id, {
    status,
    counts: countsSnapshot(counts),
    perSource,
    costMicros: budget.totalCostMicros(),
    durationMs: Date.now() - started,
  });

  await publish({
    name: "sourcing.run.completed",
    actor,
    payload: {
      searchRunId: searchRun.id,
      serviceLine: spec.serviceLine,
      status,
      counts: countsSnapshot(counts),
    },
  }).catch(() => undefined);

  const notifyUserId = options.notifyUserId ?? (actor.type === "USER" ? actor.userId : null);
  if (notifyUserId !== null) {
    await notify({
      userIds: [notifyUserId],
      type: SOURCING_RUN_COMPLETED,
      title: `Search finished: ${String(counts.leadsCreated)} new lead(s)`,
      body: `${String(counts.fetched)} results · ${String(counts.companiesCreated)} new companies · ${String(counts.leadsCreated)} new leads.`,
      link: `/acquisition/${spec.serviceLine.toLowerCase().replace(/_/g, "-")}/search?run=${searchRun.id}`,
      data: { entity: { type: "acquisition.searchRun", id: searchRun.id }, serviceLine: spec.serviceLine },
      dedupeKey: `sourcing.run:${searchRun.id}`,
    }).catch(() => undefined);
  }

  return finished;
}
