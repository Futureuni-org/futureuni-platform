import "server-only";

/**
 * Deterministic mock provider (ADR-005). Fixture lookup key is the SHA-256 of the validated
 * input JSON; when no keyed match exists we fall back to `default.json`. The mock also
 * simulates provider failures based on the env variable `AI_MOCK_FAIL`:
 *
 *   AI_MOCK_FAIL=empty    → provider returns empty text (parsed output = {})
 *   AI_MOCK_FAIL=invalid  → provider returns text that fails outputSchema
 *   AI_MOCK_FAIL=timeout  → provider throws AI_TIMEOUT
 *   AI_MOCK_FAIL=429      → provider throws AI_PROVIDER_ERROR with 429 metadata
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AiUsage } from "@/contracts/ai-service";
import { env } from "@/env";
import { aiProviderError, aiTimeout } from "../errors";
import type { AiProvider, ProviderCallInput, ProviderCallOutput } from "./provider";

const REPO_ROOT = process.cwd();

/** Rough token estimator: 4 characters ≈ 1 token. Enough to make cost calculations deterministic. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

interface MockFixtureFile {
  /** Optional map of input-hash → output. */
  byHash?: Record<string, unknown>;
  /** Fallback output when no keyed match is found. */
  default: unknown;
  /** Optional latency in ms (default 25 ms) used for buildUsage. */
  latencyMs?: number;
}

async function loadFixture(fixturePath: string): Promise<MockFixtureFile> {
  const abs = path.join(REPO_ROOT, fixturePath);
  const raw = await readFile(abs, "utf8");
  return JSON.parse(raw) as MockFixtureFile;
}

/** Public: hash a value the same way the mock does, so fixture keys are stable. */
export function hashInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export interface MockOptions {
  /** Task's mockFixture path (relative to repo root, e.g. "evals/platform/summarize-company/fixtures/default.json"). */
  fixturePath: string;
  /** The task input, already validated & PII-stripped. */
  hashKey: unknown;
}

export function createMockProvider(opts: MockOptions): AiProvider {
  return {
    kind: "mock",
    async call(input: ProviderCallInput): Promise<ProviderCallOutput> {
      // Simulate failures first so error paths are testable.
      switch (env.AI_MOCK_FAIL) {
        case "timeout":
          throw aiTimeout({ mock: true });
        case "429":
          throw aiProviderError({ mock: true, status: 429 });
        default:
          break;
      }

      const fixture = await loadFixture(opts.fixturePath);
      const key = hashInput(opts.hashKey);
      const output =
        env.AI_MOCK_FAIL === "invalid"
          ? { __invalid_mock__: true } // structured but almost certainly not matching outputSchema
          : env.AI_MOCK_FAIL === "empty"
            ? {}
            : (fixture.byHash?.[key] ?? fixture.default);

      const systemText = input.system.map((s) => s.text).join("\n\n");
      const messageText = input.messages
        .flatMap((m) => m.content.filter((c): c is { type: "text"; text: string } => c.type === "text"))
        .map((c) => c.text)
        .join("\n");
      const rawText = JSON.stringify(output);

      const usage: AiUsage = {
        inputTokens: estimateTokens(systemText) + estimateTokens(messageText),
        outputTokens: estimateTokens(rawText),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        // Mock providers do not compute cost — run-task.ts recomputes from pricing.ts using the
        // token counts here, keeping test math predictable.
        costMicros: 0,
        latencyMs: fixture.latencyMs ?? 25,
      };

      return {
        parsedOutput: output,
        rawText,
        usage,
        stopReason: "end_turn",
        cached: false,
      };
    },
  };
}
