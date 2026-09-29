import "server-only";

/**
 * The AiProvider interface — the shape every provider adapter (real, mock, potential
 * future OpenAI/Bedrock) must implement. It is deliberately narrow: it knows nothing
 * about task registration, quotas or logging. All of that sits in run-task.ts.
 */

import type { z } from "zod";

import type { AiUsage, ImageInputSchema } from "@/contracts/ai-service";

import type { StopReason } from "../types";

export type ProviderKind = "anthropic" | "mock";

export interface ProviderMessage {
  role: "user";
  /** Structured content: text parts and image parts. */
  content: ProviderContentPart[];
}

export type ProviderContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: z.infer<typeof ImageInputSchema> };

export interface ProviderCallInput {
  model: string;
  /** System blocks; the last one may carry a 5m cache breakpoint (`cache: true`). */
  system: { text: string; cache: boolean }[];
  messages: ProviderMessage[];
  maxTokens: number;
  temperature?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  timeoutMs: number;
  /** Zod schema for the response. The adapter uses native structured output (messages.parse). */
  outputSchema: z.ZodType;
  signal?: AbortSignal;
}

export interface ProviderCallOutput {
  /** The parsed structured output (already validated by the adapter against the schema). */
  parsedOutput: unknown;
  /** The raw text output (for logging with logContent !== NONE). */
  rawText: string;
  usage: AiUsage;
  stopReason: StopReason;
  /** True when the request used the prompt cache. */
  cached: boolean;
}

export interface AiProvider {
  kind: ProviderKind;
  call(input: ProviderCallInput): Promise<ProviderCallOutput>;
}
