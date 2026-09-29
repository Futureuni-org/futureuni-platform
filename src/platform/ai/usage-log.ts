import "server-only";

/**
 * Writes one AiCall row per terminal call state (INV-13). Every field of AiCall is filled
 * from the AiCallInput shape below; contentRedacted is stored only when logContent !== NONE.
 */

import type { Actor, AiOutcome } from "@/contracts/common";
import { db, Prisma, toJsonInput, type Tx } from "@/platform/db";

import type { AiCallInput, StopReason } from "./types";

export interface WrittenAiCall {
  id: string;
}

export async function writeAiCallRow(
  entry: AiCallInput,
  tx: Tx | null = null,
): Promise<WrittenAiCall> {
  const client = tx ?? db;
  const row = await client.aiCall.create({
    data: {
      task: entry.task,
      promptVersion: entry.promptVersion,
      model: entry.model,
      provider: entry.provider,
      actorType: entry.actor.type,
      actorId: entry.actor.type === "USER" ? entry.actor.userId : null,
      module: entry.context.module ?? null,
      leadId: entry.context.leadId ?? null,
      companyId: entry.context.companyId ?? null,
      jobRunId: entry.context.jobRunId ?? null,
      inputTokens: entry.tokens.input,
      outputTokens: entry.tokens.output,
      cacheReadTokens: entry.tokens.cacheRead,
      cacheWriteTokens: entry.tokens.cacheWrite,
      costMicros: entry.costMicros,
      latencyMs: entry.latencyMs,
      outcome: entry.outcome,
      errorCode: entry.errorCode ?? null,
      stopReason: entry.stopReason ?? null,
      logContent: entry.logContent,
      contentRedacted:
        entry.contentRedacted === undefined
          ? Prisma.JsonNull
          : toJsonInput(entry.contentRedacted),
    },
    select: { id: true },
  });
  return { id: row.id };
}

/** Builds an AiCallInput without writing it — used by runTask and the quota path. */
export function buildAiCallInput(args: {
  task: string;
  promptVersion: number;
  model: string;
  provider: "anthropic" | "mock";
  actor: Actor;
  context: AiCallInput["context"];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costMicros: number;
    latencyMs: number;
  };
  outcome: AiOutcome;
  errorCode?: string;
  stopReason?: StopReason;
  logContent: "NONE" | "REDACTED" | "FULL";
  contentRedacted?: unknown;
}): AiCallInput {
  return {
    task: args.task,
    promptVersion: args.promptVersion,
    model: args.model,
    provider: args.provider,
    actor: args.actor,
    context: args.context,
    tokens: {
      input: args.usage.inputTokens,
      output: args.usage.outputTokens,
      cacheRead: args.usage.cacheReadTokens,
      cacheWrite: args.usage.cacheWriteTokens,
    },
    costMicros: args.usage.costMicros,
    latencyMs: args.usage.latencyMs,
    outcome: args.outcome,
    ...(args.errorCode === undefined ? {} : { errorCode: args.errorCode }),
    ...(args.stopReason === undefined ? {} : { stopReason: args.stopReason }),
    logContent: args.logContent,
    ...(args.contentRedacted === undefined ? {} : { contentRedacted: args.contentRedacted }),
  };
}
