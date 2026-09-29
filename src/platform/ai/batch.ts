import "server-only";

/**
 * runBatch / getBatchResults. Wraps the Anthropic Message Batches API (0.5x discount,
 * ADR-018). In mock mode this synchronously runs each item through runTask and returns a
 * completed batch handle immediately — a batch is fundamentally just "N runTask calls"
 * with a deferred result stream.
 */

import type { GetBatchResults, RunBatch } from "@/contracts/ai-service";
import { AppError } from "@/lib/errors";
import { env } from "@/env";

import { runTask } from "./run-task";

interface BatchStore {
  results: Awaited<ReturnType<GetBatchResults>>;
  task: string;
  count: number;
  submittedAt: string;
}

const IN_MEMORY = new Map<string, BatchStore>();

let batchCounter = 0;
function nextBatchId(): string {
  batchCounter += 1;
  return `batch_local_${String(Date.now())}_${String(batchCounter)}`;
}

export const runBatch: RunBatch = async (req) => {
  if (!env.MOCKS) {
    // The real Anthropic batches path lives in the anthropic adapter; a follow-up phase
    // wires it once the first batch-scale caller (Phase 11 re-scoring) is ready. Wave-1
    // ships the mock path so callers can validate their end-to-end plumbing today.
    throw new AppError(
      "AI_PROVIDER_ERROR",
      "Live Message Batches path not enabled in Wave-1 (see phases/05/SUMMARY.md).",
    );
  }
  const results: Awaited<ReturnType<GetBatchResults>> = [];
  for (const item of req.items) {
    try {
      const out = await runTask({
        task: req.task,
        input: item.input,
        actor: req.actor,
      });
      results.push({
        customId: item.customId,
        ok: true,
        output: out.output,
        usage: out.usage,
      });
    } catch (err) {
      results.push({
        customId: item.customId,
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
  const batchId = nextBatchId();
  IN_MEMORY.set(batchId, {
    results,
    task: req.task,
    count: req.items.length,
    submittedAt: new Date().toISOString(),
  });
  return {
    batchId,
    task: req.task,
    count: req.items.length,
    status: "ENDED" as const,
    submittedAt: new Date().toISOString(),
  };
};

export const getBatchResults: GetBatchResults = (batchId) => {
  const stored = IN_MEMORY.get(batchId);
  if (!stored) {
    throw new AppError("NOT_FOUND", `Batch ${batchId} not found`);
  }
  return Promise.resolve(stored.results);
};
