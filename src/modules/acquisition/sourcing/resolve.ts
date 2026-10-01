import "server-only";

/**
 * Resolves a `SearchSpec` (and the line's active profile) into concrete adapter invocations: one
 * per (adapter, market, location). Shared by the runner and by `estimateSearchCost`, so the
 * estimate and the run see the same adapters, params and keywords. Disabled adapters and adapters
 * that don't support the line are filtered out (and reported so the UI can explain them).
 */

import type { Market, ServiceLine } from "@/contracts/common";
import {
  ADAPTER_SIGNAL_TYPES,
  MANUAL_LEAD_SIGNAL,
  type SearchSpec,
  type SourceAdapterId,
} from "@/contracts/source-adapter";

type SearchLocation = SearchSpec["locations"][number];
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import { getAdapter } from "./adapters/registry";
import type { AnySourceAdapter } from "./adapters/types";

export interface AdapterInvocation {
  adapter: AnySourceAdapter;
  market: Market;
  location: SearchLocation;
  keywords: string[];
  /** Validated against the adapter's own paramsSchema. */
  params: unknown;
  limitShare: number;
}

export interface ResolvedPlan {
  invocations: AdapterInvocation[];
  disabled: { adapterId: SourceAdapterId; reason: string }[];
  allowedSignalTypes: Set<string>;
}

const KEYWORD_KEYS = ["keywords", "sectors", "titles", "niches", "categories"] as const;

function keywordsFromParams(params: Record<string, unknown> | undefined): string[] {
  if (params === undefined) return [];
  const out: string[] = [];
  for (const key of KEYWORD_KEYS) {
    const value = params[key];
    if (Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === "string"));
  }
  return out;
}

interface SourceConfigLike {
  adapterId: SourceAdapterId;
  markets: Market[];
  enabled: boolean;
  defaultParams: Partial<Record<Market, Record<string, unknown>>>;
}

/** The profile's configured sources, or — when the spec names sources — those ids as ad-hoc configs. */
function sourceConfigs(spec: SearchSpec, profile: ServiceLineProfile | null): SourceConfigLike[] {
  if (spec.sources !== undefined) {
    return spec.sources.map((adapterId) => {
      const fromProfile = profile?.sources.find((s) => s.adapterId === adapterId);
      return (
        fromProfile ?? {
          adapterId,
          markets: ["NIGERIA", "INTERNATIONAL"],
          enabled: true,
          defaultParams: {},
        }
      );
    });
  }
  return profile?.sources ?? [];
}

function allowedSignalTypes(
  profile: ServiceLineProfile | null,
  adapterIds: SourceAdapterId[],
): Set<string> {
  const allowed = new Set<string>([MANUAL_LEAD_SIGNAL]);
  if (profile !== null) {
    for (const signal of profile.signals) allowed.add(signal.id);
    return allowed;
  }
  // No profile (ad-hoc source selection): trust the adapters' declared signal types.
  for (const id of adapterIds) {
    for (const type of ADAPTER_SIGNAL_TYPES[id]) allowed.add(type);
  }
  return allowed;
}

export function resolvePlan(spec: SearchSpec, profile: ServiceLineProfile | null): ResolvedPlan {
  const line: ServiceLine = spec.serviceLine;
  const invocations: AdapterInvocation[] = [];
  const disabled: { adapterId: SourceAdapterId; reason: string }[] = [];
  const usedAdapterIds: SourceAdapterId[] = [];

  for (const config of sourceConfigs(spec, profile)) {
    if (!config.enabled) continue;
    const adapter = getAdapter(config.adapterId);
    if (adapter.status === "DISABLED") {
      disabled.push({ adapterId: config.adapterId, reason: adapter.disabledReason ?? "disabled" });
      continue;
    }
    if (!adapter.supportedServiceLines.includes(line)) continue;
    usedAdapterIds.push(config.adapterId);

    for (const market of spec.markets) {
      if (!config.markets.includes(market) || !adapter.markets.includes(market)) continue;
      const params = config.defaultParams[market] ?? {};
      const keywords =
        spec.keywords.length > 0 ? [...spec.keywords] : keywordsFromParams(params);
      for (const location of spec.locations) {
        if (location.market !== market) continue;
        invocations.push({
          adapter,
          market,
          location,
          keywords,
          params: adapter.paramsSchema.parse(params),
          limitShare: 0, // filled below
        });
      }
    }
  }

  // Distribute the run's total limit across the invocations.
  const share = invocations.length === 0 ? 0 : Math.max(1, Math.floor(spec.limit / invocations.length));
  for (const invocation of invocations) invocation.limitShare = share;

  return { invocations, disabled, allowedSignalTypes: allowedSignalTypes(profile, usedAdapterIds) };
}
