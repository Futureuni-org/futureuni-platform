import "server-only";

/**
 * Anthropic adapter (ADR-006). The ONLY file allowed to import @anthropic-ai/sdk (lint
 * enforces this: eslint-plugin-boundaries + no-restricted-imports in eslint.config.mjs).
 *
 * Uses the SDK's native structured-output surface: `client.messages.parse` +
 * `zodOutputFormat(task.outputSchema)`. The response's `parsed_output` is already validated
 * against the schema. Adapter emits ONE call; retry, breaker and repair live one layer up.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  ContentBlockParam,
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources/messages";

import { aiProviderError, aiTimeout } from "../errors";
import { getCapabilities } from "../model-capabilities";
import type { AiProvider, ProviderCallInput, ProviderCallOutput } from "./provider";

export interface AnthropicOptions {
  apiKey: string;
  baseURL?: string;
}

export function createAnthropicProvider(opts: AnthropicOptions): AiProvider {
  const client = new Anthropic({
    apiKey: opts.apiKey,
    ...(opts.baseURL === undefined ? {} : { baseURL: opts.baseURL }),
  });

  return {
    kind: "anthropic",
    async call(input: ProviderCallInput): Promise<ProviderCallOutput> {
      const caps = getCapabilities(input.model);

      const system: TextBlockParam[] = input.system.map((block) => ({
        type: "text",
        text: block.text,
        ...(block.cache
          ? { cache_control: { type: "ephemeral" as const, ttl: "5m" as const } }
          : {}),
      }));

      const messages: MessageParam[] = input.messages.map((m) => ({
        role: m.role,
        content: m.content.map((part): ContentBlockParam => {
          if (part.type === "text") return { type: "text", text: part.text };
          const image = part.image;
          const source: ImageBlockParam["source"] =
            image.base64 !== undefined
              ? { type: "base64", media_type: image.mediaType, data: image.base64 }
              : image.url !== undefined
                ? { type: "url", url: image.url }
                : (() => {
                    throw new Error("image must have either base64 or url");
                  })();
          return { type: "image", source };
        }),
      }));

      const params: Parameters<typeof client.messages.parse>[0] & Record<string, unknown> = {
        model: input.model,
        max_tokens: input.maxTokens,
        system,
        messages,
        output_config: { format: zodOutputFormat(input.outputSchema) },
      };

      if (caps.acceptsTemperature && input.temperature !== undefined) {
        // Claude 5-family models reject `temperature` with a 400; the capability table
        // (model-capabilities.ts) says which models still accept it.
        (params as { temperature?: number }).temperature = input.temperature;
      }
      if (caps.acceptsEffort && input.effort !== undefined) {
        // `effort` lives inside `output_config`, not at the top level of the request.
        params.output_config = { ...params.output_config, effort: input.effort };
      }

      const start = Date.now();
      let response;
      try {
        response = await client.messages.parse(params, {
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          timeout: input.timeoutMs,
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw aiTimeout({ timeoutMs: input.timeoutMs }, err);
        }
        // Preserve status/retry metadata for the retry layer.
        throw err;
      }
      const latencyMs = Date.now() - start;

      const parsedOutput: unknown = response.parsed_output;
      if (parsedOutput === undefined || parsedOutput === null) {
        throw aiProviderError({ reason: "no parsed_output" });
      }

      const cacheReadTokens =
        (response.usage as { cache_read_input_tokens?: number | null }).cache_read_input_tokens ??
        0;
      const cacheWriteTokens =
        (response.usage as { cache_creation_input_tokens?: number | null })
          .cache_creation_input_tokens ?? 0;

      const rawText = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");

      return {
        parsedOutput,
        rawText,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens,
          cacheWriteTokens,
          costMicros: 0, // recomputed by run-task using pricing.ts
          latencyMs,
        },
        stopReason: response.stop_reason ?? "end_turn",
        cached: cacheReadTokens > 0,
      };
    },
  };
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ((err as { name?: string }).name === "AbortError" ||
      (err as { code?: string }).code === "ERR_ABORTED")
  );
}
