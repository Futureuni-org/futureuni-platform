/**
 * Scoring and throttle settings (phase-11 Step 8). Registered on the acquisition manifest by Phase 19
 * through `phases/11/REQUESTS.md`. Keys and defaults live in `./config`, which also reads them
 * defensively before registration. The low-score behaviour is a per-line profile field
 * (`scoring.lowScoreAction`), not a platform setting.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";

import { SCORING_SETTING_DEFAULTS, SCORING_SETTING_KEYS } from "./config";

export const scoringSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: SCORING_SETTING_KEYS.slowAtPercent,
    scope: "MODULE",
    schema: z.int().min(1).max(100),
    default: SCORING_SETTING_DEFAULTS.slowAtPercent,
    label: "Throttle: slow at (% of capacity)",
    description: "Load at or above this percent of a line's capacity slows new first touches.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "throttle",
  }),
  defineSetting<number>({
    key: SCORING_SETTING_KEYS.pauseAtPercent,
    scope: "MODULE",
    schema: z.int().min(1).max(200),
    default: SCORING_SETTING_DEFAULTS.pauseAtPercent,
    label: "Throttle: pause at (% of capacity)",
    description: "Load at or above this percent pauses new first touches; new qualified leads nurture.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "throttle",
  }),
  defineSetting<number>({
    key: SCORING_SETTING_KEYS.slowFactor,
    scope: "MODULE",
    schema: z.number().min(0).max(1),
    default: SCORING_SETTING_DEFAULTS.slowFactor,
    label: "Throttle: slow factor",
    description: "While slowed, the daily first-touch cap drops to this fraction of normal.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "throttle",
  }),
  defineSetting<number>({
    key: SCORING_SETTING_KEYS.firstTouchDailyCapPerLine,
    scope: "MODULE",
    schema: z.int().min(0).max(500),
    default: SCORING_SETTING_DEFAULTS.firstTouchDailyCapPerLine,
    label: "Outreach: daily first-touch cap per line",
    description: "Maximum new first touches approved per line per day (a profile can override it).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "throttle",
  }),
  defineSetting<number>({
    key: SCORING_SETTING_KEYS.rescoreAgeDays,
    scope: "MODULE",
    schema: z.int().min(1).max(365),
    default: SCORING_SETTING_DEFAULTS.rescoreAgeDays,
    label: "Scoring: nightly re-score age (days)",
    description: "SCORED leads older than this are re-scored by the nightly job.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "scoring",
  }),
];
