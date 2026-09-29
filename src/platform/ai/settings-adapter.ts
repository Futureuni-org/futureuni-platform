/**
 * Reads the AI settings from `@/platform/settings` in the shape `AiSettingsSchema` expects.
 *
 * Replaces the Phase-5 SEAM-SETTINGS-AI stand-in. Wired at the Wave 1 batch B1 integration.
 */

import "server-only";

import type { AiSettings } from "@/contracts/ai-service";
import { env } from "@/env";
import { resolveProviderKey } from "@/platform/credentials";
import { getSetting } from "@/platform/settings";

interface ModelTiersSetting {
  fast: string;
  balanced: string;
  deep: string;
  fastFallback: string | null;
  balancedFallback: string | null;
  deepFallback: string | null;
}

interface AiBudgetsSetting {
  platformDailyUsd: number;
  platformMonthlyUsd: number;
  perModuleDailyUsd: Record<string, number>;
  perUserDailyCalls: number;
  perTaskMaxTokens: number;
}

type LogOverrides = Record<string, "NONE" | "REDACTED" | "FULL">;

const LOG_CONTENT_MAP = {
  NONE: "none",
  REDACTED: "redacted",
  FULL: "full",
} as const;

export async function getAiSettings(): Promise<AiSettings> {
  const [tiers, budgets, overrides] = await Promise.all([
    getSetting<ModelTiersSetting>("ai.modelTiers"),
    getSetting<AiBudgetsSetting>("ai.budgets"),
    getSetting<LogOverrides>("ai.logContentOverrides"),
  ]);

  const fallback: NonNullable<AiSettings["fallbackModels"]> = {};
  if (tiers.fastFallback !== null) fallback.fast = tiers.fastFallback;
  if (tiers.balancedFallback !== null) fallback.balanced = tiers.balancedFallback;
  if (tiers.deepFallback !== null) fallback.deep = tiers.deepFallback;

  return {
    modelTiers: {
      fast: tiers.fast,
      balanced: tiers.balanced,
      deep: tiers.deep,
    },
    fallbackModels: fallback,
    budgets: {
      platformDailyUsd: budgets.platformDailyUsd,
      platformMonthlyUsd: budgets.platformMonthlyUsd,
      perModuleDailyUsd: budgets.perModuleDailyUsd,
      perUserDailyCalls: budgets.perUserDailyCalls,
    },
    logContentOverrides: Object.fromEntries(
      Object.entries(overrides).map(([task, level]) => [task, LOG_CONTENT_MAP[level]]),
    ),
  };
}

/**
 * Provider key resolver: prefers the encrypted credentials vault; falls back to env.
 * Today only Anthropic is registered; extend by adding branches when we wire a second provider.
 */
export async function getProviderKey(provider: "anthropic"): Promise<string | null> {
  const fromVault = await resolveProviderKey(provider);
  if (fromVault !== null && fromVault !== "") return fromVault;
  return env.ANTHROPIC_API_KEY ?? null;
}
