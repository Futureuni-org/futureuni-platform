import "server-only";

/**
 * streamTask (contract StreamTask). The Wave-1 implementation is a thin wrapper over
 * runTask — it emits one text delta with the full output text, then a final event with
 * the validated output. Wave-2 replaces the wrapper with a true SSE consumer of
 * client.messages.stream once a task actually needs incremental UI drafting (Phase 12's
 * acquisition.outreach-draft-edit).
 */

import type { StreamTask, StreamTaskEvent } from "@/contracts/ai-service";
import { AppError } from "@/lib/errors";

import { runTask } from "./run-task";

type StreamErrorCode = "AI_OUTPUT_INVALID" | "AI_QUOTA_EXCEEDED" | "AI_TIMEOUT" | "AI_PROVIDER_ERROR";

export const streamTask: StreamTask = (req) => {
  const options: { promptVersion?: number; maxTokens?: number } = {};
  if (req.options?.promptVersion !== undefined) options.promptVersion = req.options.promptVersion;
  if (req.options?.maxTokens !== undefined) options.maxTokens = req.options.maxTokens;

  return Promise.resolve(
    new ReadableStream<StreamTaskEvent>({
      async start(controller) {
      try {
        const runReq: Parameters<typeof runTask>[0] = {
          task: req.task,
          input: req.input,
          actor: req.actor,
        };
        if (req.context !== undefined) runReq.context = req.context;
        if (req.images !== undefined) runReq.images = req.images;
        if (Object.keys(options).length > 0) runReq.options = options;
        const result = await runTask(runReq);
        const text = JSON.stringify(result.output);
        controller.enqueue({ type: "delta", text });
        controller.enqueue({
          type: "final",
          output: result.output,
          usage: result.usage,
          callId: result.callId,
        });
        controller.close();
      } catch (err) {
        controller.enqueue({
          type: "error",
          code: mapCodeToStreamError(err),
          message: err instanceof Error ? err.message : "Unknown error",
        });
        controller.close();
      }
    },
  }),
  );
};

function mapCodeToStreamError(err: unknown): StreamErrorCode {
  if (!(err instanceof AppError)) return "AI_PROVIDER_ERROR";
  if (
    err.code === "AI_OUTPUT_INVALID" ||
    err.code === "AI_QUOTA_EXCEEDED" ||
    err.code === "AI_TIMEOUT"
  ) {
    return err.code;
  }
  return "AI_PROVIDER_ERROR";
}

