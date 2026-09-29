import "server-only";

/**
 * Registers the platform-owned AI tasks. Called once from src/platform/ai/index.ts
 * when the module loads. Idempotent — safe to call multiple times.
 */

import { registerTask } from "../registry";
import { summarizeCompanyTask } from "./summarize-company";
import { evalJudgeTask } from "./eval-judge";

let registered = false;

export function registerPlatformTasks(): void {
  if (registered) return;
  registered = true;
  registerTask(summarizeCompanyTask);
  registerTask(evalJudgeTask);
}
