/**
 * Estimated per-operation costs in micro-USD, used for the per-lead cost cap (ADR-027). Captures use
 * the Vercel Sandbox estimate from ADR-017 (~$0.002); provider APIs used here are free; AI costs are
 * recorded from the real `runTask` usage but gated by these estimates.
 */

export const COST_MICROS = {
  capture: 2_000,
  pagespeed: 0,
  youtube: 0,
  appStore: 0,
  aiVision: 15_000,
  aiText: 3_000,
} as const;
