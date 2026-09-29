import "server-only";

/**
 * Chooses a provider for one call. Precedence:
 *
 *   1. env.MOCKS === true  → always the mock provider.
 *   2. getAiSettings() may add a "mock" override in future (Phase 6).
 *   3. Otherwise, the real Anthropic adapter.
 *
 * Split from the adapters so tests can stub each provider without loading the SDK.
 */

import { env } from "@/env";

import type { AiProvider } from "./provider";
import { createAnthropicProvider } from "./anthropic";
import { createMockProvider } from "./mock";

export interface SelectProviderArgs {
  /** Fixture path from the task definition (used only when the mock is selected). */
  fixturePath: string;
  /** The hashable input (validated, PII-stripped). */
  hashKey: unknown;
  /** The provider key, if the real adapter is selected. */
  apiKey: string | null;
}

export function selectProvider(args: SelectProviderArgs): AiProvider {
  if (env.MOCKS || args.apiKey === null) {
    return createMockProvider({ fixturePath: args.fixturePath, hashKey: args.hashKey });
  }
  return createAnthropicProvider({ apiKey: args.apiKey });
}
