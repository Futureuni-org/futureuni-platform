import "server-only";

/**
 * @/platform/ai — the platform AI service. Public API for every module.
 *
 * Contract: docs/contracts/ai-service.md and src/contracts/ai-service.ts.
 *
 *   runTask, streamTask, runBatch, getBatchResults    — the four ways to call a model.
 *   registerTask, defineTask, getTask                 — the task registry.
 *   assertClaimsCited, stripCitationMarkers,          — INV-5 evidence enforcement.
 *   CITATION_MARKER                                     (re-exported from the contract).
 *   publishPromptVersion, activatePromptVersion,      — prompt-version services (Phase 18 UI).
 *   listPromptVersions, diffPromptVersions
 *   getUsageSummary, getCostPerOutcome                — AI usage reporting (Phase 18 UI).
 *
 * Rule (INV, ADR-006): this folder is the ONLY importer of @anthropic-ai/sdk in the whole
 * repo. Everywhere else imports from @/platform/ai and never from @anthropic-ai/sdk.
 */

// Public API — contract types.
export { CITATION_MARKER } from "@/contracts/ai-service";

// Runtime exports (typed by the contract).
export { runTask } from "./run-task";
export { streamTask } from "./stream-task";
export { runBatch, getBatchResults } from "./batch";
export {
  registerTask,
  defineTask,
  getTask,
  listRegisteredTaskIds,
  bootRegistry,
} from "./registry";
export { assertClaimsCited, stripCitationMarkers } from "./citations";
export {
  publishPromptVersion,
  activatePromptVersion,
  listPromptVersions,
  diffPromptVersions,
  setEvalHookForTesting,
  EVAL_REGRESSION_TOLERANCE,
  type PromptVersionRow,
} from "./prompt-versions";
export { getUsageSummary, getCostPerOutcome, type UsageBucket, type UsageGroupBy } from "./reporting";

// Ensure platform tasks are registered when this module is imported.
import { bootRegistry } from "./registry";
import { registerPlatformTasks } from "./platform-tasks";

registerPlatformTasks();
bootRegistry();
