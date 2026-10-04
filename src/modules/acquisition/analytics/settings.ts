/**
 * Analytics settings (Phase 17). Dotted keys, read with `getSetting`, registered on the acquisition
 * manifest by Phase 19 through `phases/17/REQUESTS.md`. Until then every read falls back to the
 * in-file default.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";
import { getSetting } from "@/platform/settings";

export const ANALYTICS_SETTING_KEYS = {
  weeklyReportEnabled: "acquisition.analytics.weeklyReportEnabled",
  lowSampleThreshold: "acquisition.analytics.lowSampleThreshold",
} as const;

export const ANALYTICS_DEFAULTS = {
  weeklyReportEnabled: true,
  lowSampleThreshold: 20,
} as const;

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await getSetting<T | null | undefined>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function isWeeklyReportEnabled(): Promise<boolean> {
  return read(ANALYTICS_SETTING_KEYS.weeklyReportEnabled, ANALYTICS_DEFAULTS.weeklyReportEnabled);
}

export function getLowSampleThreshold(): Promise<number> {
  return read(ANALYTICS_SETTING_KEYS.lowSampleThreshold, ANALYTICS_DEFAULTS.lowSampleThreshold);
}

export const analyticsSettings: SettingDefinition[] = [
  defineSetting<boolean>({
    key: ANALYTICS_SETTING_KEYS.weeklyReportEnabled,
    scope: "MODULE",
    schema: z.boolean(),
    default: ANALYTICS_DEFAULTS.weeklyReportEnabled,
    label: "Analytics: weekly report email",
    description: "When on, managers and admins get the Monday weekly insight email. Turn off to pause it.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "analytics",
  }),
  defineSetting<number>({
    key: ANALYTICS_SETTING_KEYS.lowSampleThreshold,
    scope: "MODULE",
    schema: z.int().min(1).max(1_000),
    default: ANALYTICS_DEFAULTS.lowSampleThreshold,
    label: "Analytics: low-sample threshold",
    description: "Breakdown rows with fewer than this many leads are muted and marked 'low sample'.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "analytics",
  }),
];
