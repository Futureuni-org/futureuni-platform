import "server-only";

/**
 * Internal types local to src/platform/ai. Nothing here is re-exported from index.ts — public
 * types come from @/contracts/ai-service.
 */

import type { Actor, AiOutcome } from "@/contracts/common";

/** Anthropic stop-reasons the adapter forwards on for logging (free-form string per SDK). */
export type StopReason = string;

/** The one AiCall row written after every terminal call state. */
export interface AiCallInput {
  task: string;
  promptVersion: number;
  model: string;
  provider: "anthropic" | "mock";
  actor: Actor;
  context: {
    module?: string;
    leadId?: string;
    companyId?: string;
    jobRunId?: string;
  };
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  costMicros: number;
  latencyMs: number;
  outcome: AiOutcome;
  errorCode?: string;
  stopReason?: StopReason;
  /** JSON payload stored when logContent !== NONE. */
  contentRedacted?: unknown;
  logContent: "NONE" | "REDACTED" | "FULL";
}
