import "server-only";

/**
 * Defensive reads for the scoring and throttle settings. These settings are registered on the
 * acquisition manifest only at the Wave 3 integration (Phase 19), so until then `getSetting` would
 * throw for an unregistered key — every read here falls back to the default (same pattern as
 * `audits/config.ts`). The keys and defaults are the single source for `settings.ts`.
 */

import { getSetting } from "@/platform/settings";

export const SCORING_SETTING_KEYS = {
  slowAtPercent: "acquisition.throttle.slowAtPercent",
  pauseAtPercent: "acquisition.throttle.pauseAtPercent",
  slowFactor: "acquisition.throttle.slowFactor",
  firstTouchDailyCapPerLine: "acquisition.firstTouchDailyCapPerLine",
  rescoreAgeDays: "acquisition.scoring.rescoreAgeDays",
} as const;

export const SCORING_SETTING_DEFAULTS = {
  slowAtPercent: 70,
  pauseAtPercent: 100,
  slowFactor: 0.3,
  firstTouchDailyCapPerLine: 30,
  rescoreAgeDays: 14,
} as const;

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    return await getSetting<T>(key);
  } catch {
    return fallback;
  }
}

export interface ThrottleThresholds {
  slowAtPercent: number;
  pauseAtPercent: number;
  slowFactor: number;
  dailyFirstTouchCap: number;
}

/** Platform-level throttle thresholds and the daily first-touch cap (before any profile override). */
export async function getThrottleThresholds(): Promise<ThrottleThresholds> {
  const [slowAtPercent, pauseAtPercent, slowFactor, dailyFirstTouchCap] = await Promise.all([
    read(SCORING_SETTING_KEYS.slowAtPercent, SCORING_SETTING_DEFAULTS.slowAtPercent),
    read(SCORING_SETTING_KEYS.pauseAtPercent, SCORING_SETTING_DEFAULTS.pauseAtPercent),
    read(SCORING_SETTING_KEYS.slowFactor, SCORING_SETTING_DEFAULTS.slowFactor),
    read(SCORING_SETTING_KEYS.firstTouchDailyCapPerLine, SCORING_SETTING_DEFAULTS.firstTouchDailyCapPerLine),
  ]);
  return { slowAtPercent, pauseAtPercent, slowFactor, dailyFirstTouchCap };
}

export async function getRescoreAgeDays(): Promise<number> {
  return read(SCORING_SETTING_KEYS.rescoreAgeDays, SCORING_SETTING_DEFAULTS.rescoreAgeDays);
}
