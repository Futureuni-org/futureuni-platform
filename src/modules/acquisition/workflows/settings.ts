/**
 * Settings for the lead-advance workflow and its sweepers (Phase 19). Concurrency caps keep one big
 * search from starving other lines or burning provider quota; the stuck threshold and max restarts
 * govern the safety-net sweepers. Registered on the acquisition manifest.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";

export const ADVANCE_SETTING_KEYS = {
  maxConcurrentGlobal: "acquisition.advance.maxConcurrentGlobal",
  maxConcurrentPerLine: "acquisition.advance.maxConcurrentPerLine",
  stuckThresholdMinutes: "acquisition.advance.stuckThresholdMinutes",
  maxRestarts: "acquisition.advance.maxRestarts",
} as const;

export const ADVANCE_SETTING_DEFAULTS = {
  maxConcurrentGlobal: 20,
  maxConcurrentPerLine: 5,
  stuckThresholdMinutes: 120,
  maxRestarts: 3,
} as const;

export const workflowSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: ADVANCE_SETTING_KEYS.maxConcurrentGlobal,
    scope: "MODULE",
    schema: z.int().min(1).max(1000),
    default: ADVANCE_SETTING_DEFAULTS.maxConcurrentGlobal,
    label: "Advance: max concurrent (global)",
    description: "Most leads advancing through enrich/audit at once across all lines.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "advance",
  }),
  defineSetting<number>({
    key: ADVANCE_SETTING_KEYS.maxConcurrentPerLine,
    scope: "MODULE",
    schema: z.int().min(1).max(500),
    default: ADVANCE_SETTING_DEFAULTS.maxConcurrentPerLine,
    label: "Advance: max concurrent (per line)",
    description: "Most leads advancing through enrich/audit at once for a single service line.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "advance",
  }),
  defineSetting<number>({
    key: ADVANCE_SETTING_KEYS.stuckThresholdMinutes,
    scope: "MODULE",
    schema: z.int().min(5).max(1440),
    default: ADVANCE_SETTING_DEFAULTS.stuckThresholdMinutes,
    label: "Advance: stuck threshold (minutes)",
    description: "A lead idle in a pre-contact status longer than this is re-advanced by the sweeper.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "advance",
  }),
  defineSetting<number>({
    key: ADVANCE_SETTING_KEYS.maxRestarts,
    scope: "MODULE",
    schema: z.int().min(1).max(20),
    default: ADVANCE_SETTING_DEFAULTS.maxRestarts,
    label: "Advance: max sweeper restarts",
    description: "After this many sweeper restarts a stuck lead is flagged for manual attention.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "advance",
  }),
];

async function readInt(key: string, fallback: number): Promise<number> {
  try {
    // Lazy import keeps the platform settings runtime out of the manifest's codegen import graph.
    const { getSetting } = await import("@/platform/settings");
    return await getSetting<number>(key);
  } catch {
    return fallback;
  }
}

/** The resolved advance settings (stored values, or the registered defaults). */
export async function getAdvanceSettings(): Promise<{
  maxConcurrentGlobal: number;
  maxConcurrentPerLine: number;
  stuckThresholdMinutes: number;
  maxRestarts: number;
}> {
  const [maxConcurrentGlobal, maxConcurrentPerLine, stuckThresholdMinutes, maxRestarts] =
    await Promise.all([
      readInt(ADVANCE_SETTING_KEYS.maxConcurrentGlobal, ADVANCE_SETTING_DEFAULTS.maxConcurrentGlobal),
      readInt(
        ADVANCE_SETTING_KEYS.maxConcurrentPerLine,
        ADVANCE_SETTING_DEFAULTS.maxConcurrentPerLine,
      ),
      readInt(
        ADVANCE_SETTING_KEYS.stuckThresholdMinutes,
        ADVANCE_SETTING_DEFAULTS.stuckThresholdMinutes,
      ),
      readInt(ADVANCE_SETTING_KEYS.maxRestarts, ADVANCE_SETTING_DEFAULTS.maxRestarts),
    ]);
  return { maxConcurrentGlobal, maxConcurrentPerLine, stuckThresholdMinutes, maxRestarts };
}
