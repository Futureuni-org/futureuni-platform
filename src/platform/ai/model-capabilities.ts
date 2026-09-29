import "server-only";

/**
 * Per-model capability table (verified against docs.claude.com 2026-09-29).
 *
 * Some Claude models reject `temperature` and `top_p`; some accept `effort`; Opus 5.5 and
 * Fable 5.1 have adaptive extended-thinking permanently on and reject `thinking: { type:
 * "disabled" }` with a 400. The Anthropic adapter uses this table to build request params
 * that the model accepts. Unknown models fall back to the conservative "sampling only".
 */

export interface ModelCapabilities {
  /** Model accepts a numeric `temperature` sampling parameter. */
  acceptsTemperature: boolean;
  /** Model accepts a numeric `top_p` sampling parameter. */
  acceptsTopP: boolean;
  /** Model accepts an `effort` parameter (low|medium|high|xhigh|max) that supersedes thinking-budget knobs. */
  acceptsEffort: boolean;
  /** Model has adaptive extended thinking permanently on and rejects `thinking: { type: "disabled" }`. */
  adaptiveThinkingAlwaysOn: boolean;
  /** Model supports the older explicit-budget extended-thinking config (fallback for Haiku). */
  supportsExtendedThinkingConfig: boolean;
}

/** Conservative default for models not in the table — sampling params only, no effort/thinking. */
const DEFAULT_CAPS: ModelCapabilities = {
  acceptsTemperature: true,
  acceptsTopP: true,
  acceptsEffort: false,
  adaptiveThinkingAlwaysOn: false,
  supportsExtendedThinkingConfig: false,
};

const CAPS: Record<string, ModelCapabilities> = {
  "claude-haiku-4-5": {
    acceptsTemperature: true,
    acceptsTopP: true,
    acceptsEffort: false,
    adaptiveThinkingAlwaysOn: false,
    supportsExtendedThinkingConfig: true,
  },
  "claude-haiku-4-5-20251001": {
    acceptsTemperature: true,
    acceptsTopP: true,
    acceptsEffort: false,
    adaptiveThinkingAlwaysOn: false,
    supportsExtendedThinkingConfig: true,
  },
  "claude-sonnet-5-5": {
    acceptsTemperature: true,
    acceptsTopP: true,
    acceptsEffort: true,
    adaptiveThinkingAlwaysOn: false,
    supportsExtendedThinkingConfig: false,
  },
  "claude-opus-5-5": {
    acceptsTemperature: true,
    acceptsTopP: true,
    acceptsEffort: true,
    adaptiveThinkingAlwaysOn: true,
    supportsExtendedThinkingConfig: false,
  },
  "claude-fable-5-1": {
    acceptsTemperature: true,
    acceptsTopP: true,
    acceptsEffort: true,
    adaptiveThinkingAlwaysOn: true,
    supportsExtendedThinkingConfig: false,
  },
  "claude-opus-5": DEFAULT_CAPS,
  "claude-sonnet-5": DEFAULT_CAPS,
};

export function getCapabilities(model: string): ModelCapabilities {
  return CAPS[model] ?? DEFAULT_CAPS;
}
