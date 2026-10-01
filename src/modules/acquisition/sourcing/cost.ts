import "server-only";

/**
 * `estimateSearchCost` — the before-you-run estimate the Search panel shows (module spec US-2):
 * the expected number of provider calls and an approximate cost in micro-USD, per adapter and in
 * total. It resolves the same plan the runner will, then asks each adapter to estimate its calls.
 */

import { SearchSpecSchema, type SearchSpec } from "@/contracts/source-adapter";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { AppError } from "@/lib/errors";

import { resolvePlan } from "./resolve";

export interface AdapterCostEstimate {
  adapterId: string;
  market: string;
  calls: number;
  costMicros: number;
}

export interface SearchCostEstimate {
  totalCalls: number;
  totalCostMicros: number;
  perAdapter: AdapterCostEstimate[];
}

export function estimateSearchCostFor(
  spec: SearchSpec,
  profile: ServiceLineProfile | null,
): SearchCostEstimate {
  const { invocations } = resolvePlan(spec, profile);
  const perAdapter: AdapterCostEstimate[] = [];
  let totalCalls = 0;
  let totalCostMicros = 0;

  for (const invocation of invocations) {
    const locationCount = spec.locations.filter((l) => l.market === invocation.market).length;
    const calls = Math.max(
      0,
      invocation.adapter.estimateCalls(invocation.params, {
        market: invocation.market,
        locationCount,
        keywords: invocation.keywords,
        limit: invocation.limitShare,
      }),
    );
    const costMicros = calls * invocation.adapter.costPerCallMicros;
    totalCalls += calls;
    totalCostMicros += costMicros;
    perAdapter.push({
      adapterId: invocation.adapter.id,
      market: invocation.market,
      calls,
      costMicros,
    });
  }

  return { totalCalls, totalCostMicros, perAdapter };
}

/** The before-you-run estimate the Search panel calls with just a spec; loads the active profile. */
export async function estimateSearchCost(rawSpec: unknown): Promise<SearchCostEstimate> {
  const spec: SearchSpec = SearchSpecSchema.parse(rawSpec);
  const { getActiveProfile } = await import("@/modules/acquisition/profiles");
  let profile: ServiceLineProfile | null = null;
  try {
    profile = await getActiveProfile(spec.serviceLine);
  } catch (error) {
    if (!(error instanceof AppError && error.code === "NOT_FOUND")) throw error;
  }
  return estimateSearchCostFor(spec, profile);
}
