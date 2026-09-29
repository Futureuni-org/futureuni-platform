import "server-only";

/**
 * Anthropic model prices in integer micro-USD per token (ADR-027).
 *
 * Prices verified against https://platform.claude.com/docs/en/about-claude/pricing on 2026-09-29.
 * Model catalogue: https://platform.claude.com/docs/en/about-claude/models/overview.
 *
 * Price columns (per million tokens, USD):
 *   claude-haiku-4-5   : $1 in / $5 out ; cache read 0.10x ; cache write 5m 1.25x, 1h 2x
 *   claude-sonnet-5-5  : $2 in / $10 out ; cache read 0.10x ; cache write 5m 1.25x, 1h 2x
 *   claude-opus-5-5    : $4 in / $20 out ; cache read 0.05x ; cache write 5m 1.25x, 1h 2x
 * Legacy still callable if configured: claude-opus-5 ($5/$25), claude-sonnet-5 ($3/$15),
 * claude-fable-5-1 ($10/$50), plus dated builds (claude-haiku-4-5-20251001, …).
 *
 * Message Batches API applies a 0.5x discount to every token category (input, output, cache
 * read, cache write).
 */

import type { AiUsage } from "@/contracts/ai-service";
import { AppError } from "@/lib/errors";

/** Every price is stored as micro-USD (1 USD = 1_000_000) per single token. */
export interface ModelPricing {
  /** Micro-USD per input token. */
  inputPerToken: number;
  /** Micro-USD per output token. */
  outputPerToken: number;
  /** Multiplier applied to input price for cache-read tokens (typically 0.05–0.10). */
  cacheReadMultiplier: number;
  /** Multiplier applied to input price for 5-minute cache-write tokens (1.25). */
  cacheWrite5mMultiplier: number;
  /** Multiplier applied to input price for 1-hour cache-write tokens (2.0). */
  cacheWrite1hMultiplier: number;
}

/**
 * Micro-USD per token, computed from published $ / MTok figures.
 *   $1  / 1_000_000 tokens * 1_000_000 µUSD/USD = 1 µUSD/token
 *   $5  / 1_000_000 tokens * 1_000_000 µUSD/USD = 5 µUSD/token
 */
const MODEL_PRICES: Record<string, ModelPricing> = {
  // Fast tier
  "claude-haiku-4-5": {
    inputPerToken: 1,
    outputPerToken: 5,
    cacheReadMultiplier: 0.1,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  "claude-haiku-4-5-20251001": {
    inputPerToken: 1,
    outputPerToken: 5,
    cacheReadMultiplier: 0.1,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  // Balanced tier
  "claude-sonnet-5-5": {
    inputPerToken: 2,
    outputPerToken: 10,
    cacheReadMultiplier: 0.1,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  // Deep tier
  "claude-opus-5-5": {
    inputPerToken: 4,
    outputPerToken: 20,
    cacheReadMultiplier: 0.05,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  // Legacy — kept available so a settings-driven downgrade or pin still works.
  "claude-opus-5": {
    inputPerToken: 5,
    outputPerToken: 25,
    cacheReadMultiplier: 0.05,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  "claude-sonnet-5": {
    inputPerToken: 3,
    outputPerToken: 15,
    cacheReadMultiplier: 0.1,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
  "claude-fable-5-1": {
    inputPerToken: 10,
    outputPerToken: 50,
    cacheReadMultiplier: 0.025,
    cacheWrite5mMultiplier: 1.25,
    cacheWrite1hMultiplier: 2,
  },
};

/** Batches API discount applied to the whole bill (ADR-018). */
export const BATCH_DISCOUNT = 0.5;

/** Returns the price row for a model ID, throwing if it is not in the catalogue. */
export function getPricing(model: string): ModelPricing {
  const p = MODEL_PRICES[model];
  if (!p) {
    throw new AppError("INTERNAL", `No pricing entry for model "${model}"`, {
      details: { model },
    });
  }
  return p;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from an existing prompt cache. */
  cacheReadTokens: number;
  /** Tokens written to the 5-minute cache. */
  cacheWrite5mTokens: number;
  /** Tokens written to the 1-hour cache. */
  cacheWrite1hTokens: number;
}

/** Computes cost in integer micro-USD for one call, rounding half-up at the final step. */
export function computeCostMicros(
  model: string,
  tokens: TokenCounts,
  opts: { batch?: boolean } = {},
): number {
  const p = getPricing(model);
  const raw =
    tokens.inputTokens * p.inputPerToken +
    tokens.outputTokens * p.outputPerToken +
    tokens.cacheReadTokens * (p.inputPerToken * p.cacheReadMultiplier) +
    tokens.cacheWrite5mTokens * (p.inputPerToken * p.cacheWrite5mMultiplier) +
    tokens.cacheWrite1hTokens * (p.inputPerToken * p.cacheWrite1hMultiplier);
  const discounted = opts.batch ? raw * BATCH_DISCOUNT : raw;
  return Math.round(discounted);
}

/** Builds the AiUsage record stored on RunTaskResult and AiCall. cacheWriteTokens sums 5m and 1h. */
export function buildUsage(
  model: string,
  tokens: TokenCounts,
  latencyMs: number,
  opts: { batch?: boolean } = {},
): AiUsage {
  return {
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    cacheWriteTokens: tokens.cacheWrite5mTokens + tokens.cacheWrite1hTokens,
    costMicros: computeCostMicros(model, tokens, opts),
    latencyMs,
  };
}

/** All model IDs the pricing table currently knows. */
export function listKnownModels(): readonly string[] {
  return Object.keys(MODEL_PRICES);
}
