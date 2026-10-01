/**
 * Internal adapter type (Phase 8). Extends the `SourceAdapter` contract with `estimateCalls`, used
 * by `estimateSearchCost` to show a before-you-run estimate (module spec US-2). Adapters are stored
 * type-erased (like `defineJob`): the runner validates params with the adapter's own `paramsSchema`
 * before calling `search`/`estimateCalls`, so no `any` is needed.
 */

import type { Market } from "@/contracts/common";
import type { SourceAdapter } from "@/contracts/source-adapter";

export interface EstimateContext {
  market: Market;
  /** How many of the run's locations fall in this market. */
  locationCount: number;
  keywords: string[];
  /** This adapter's share of the run's result limit. */
  limit: number;
}

export interface InternalSourceAdapter<TParams> extends SourceAdapter<TParams> {
  /** Expected number of provider calls for one market, used for the cost estimate (US-2). */
  estimateCalls(params: TParams, ctx: EstimateContext): number;
}

/** Type-erased adapter, as the registry stores them. */
export type AnySourceAdapter = InternalSourceAdapter<unknown>;

/** Identity helper that erases the adapter's params type for storage in the registry. */
export function defineAdapter<TParams>(adapter: InternalSourceAdapter<TParams>): AnySourceAdapter {
  return adapter;
}
