/**
 * Sourcing settings (Phase 8). Budget caps, result limits, CSV limits and concurrency.
 * Registered on the acquisition manifest by Phase 19 through `phases/08/REQUESTS.md`.
 *
 * Keys are dotted (`acquisition.sourcing.*`), MODULE-scoped and read with `getSetting` at the
 * start of a run. Budgets are in integer micro-USD (`costMicros`, ADR-027); calls are counts.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { getSetting } from "@/platform/settings";
import { defineSetting } from "@/platform/registry/define";

/** Keys, so the runner and limiter never repeat string literals. */
export const SOURCING_SETTING_KEYS = {
  maxProviderCallsPerRun: "acquisition.sourcing.maxProviderCallsPerRun",
  maxCostMicrosPerRun: "acquisition.sourcing.maxCostMicrosPerRun",
  providerDailyCostCapMicros: "acquisition.sourcing.providerDailyCostCapMicros",
  concurrency: "acquisition.sourcing.concurrency",
  maxCsvRows: "acquisition.sourcing.maxCsvRows",
} as const;

/** The defaults, also used as a fallback before Phase 19 registers these settings on the manifest. */
export const SOURCING_DEFAULTS = {
  maxProviderCallsPerRun: 300,
  maxCostMicrosPerRun: 5_000_000,
  providerDailyCostCapMicros: 20_000_000,
  concurrency: 3,
  maxCsvRows: 5_000,
} as const;

/** Reads a sourcing setting, falling back to its default if it isn't registered yet or has no row. */
export async function getSourcingSetting(key: keyof typeof SOURCING_DEFAULTS): Promise<number> {
  try {
    const value = await getSetting<number>(SOURCING_SETTING_KEYS[key]);
    return typeof value === "number" ? value : SOURCING_DEFAULTS[key];
  } catch {
    return SOURCING_DEFAULTS[key];
  }
}

export const sourcingSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: SOURCING_SETTING_KEYS.maxProviderCallsPerRun,
    scope: "MODULE",
    schema: z.int().min(1).max(5_000),
    default: 300,
    label: "Sourcing: max provider calls per run",
    description: "A single search run stops once its adapters have made this many provider calls.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "sourcing",
  }),
  defineSetting<number>({
    key: SOURCING_SETTING_KEYS.maxCostMicrosPerRun,
    scope: "MODULE",
    schema: z.int().min(0).max(100_000_000),
    default: 5_000_000, // $5.00
    label: "Sourcing: max estimated cost per run (micro-USD)",
    description: "A run stops once its estimated paid-provider cost reaches this many micro-USD.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "sourcing",
  }),
  defineSetting<number>({
    key: SOURCING_SETTING_KEYS.providerDailyCostCapMicros,
    scope: "MODULE",
    schema: z.int().min(0).max(1_000_000_000),
    default: 20_000_000, // $20.00 per provider per day
    label: "Sourcing: per-provider daily cost cap (micro-USD)",
    description:
      "Across all runs, each paid provider stops for the day once it reaches this many micro-USD.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "sourcing",
  }),
  defineSetting<number>({
    key: SOURCING_SETTING_KEYS.concurrency,
    scope: "MODULE",
    schema: z.int().min(1).max(10),
    default: 3,
    label: "Sourcing: adapter concurrency",
    description: "How many source adapters a run executes at once.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "sourcing",
  }),
  defineSetting<number>({
    key: SOURCING_SETTING_KEYS.maxCsvRows,
    scope: "MODULE",
    schema: z.int().min(1).max(100_000),
    default: 5_000,
    label: "Sourcing: max CSV import rows",
    description: "A CSV import with more data rows than this is refused before anything is created.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "sourcing",
  }),
];
