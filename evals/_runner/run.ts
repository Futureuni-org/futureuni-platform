import { runTask } from "@/platform/ai";
import { getTask } from "@/platform/ai/registry";

import { runBasicChecks } from "./checks";
import { loadCases } from "./loader";
import type { CaseResult, EvalReport } from "./types";

/**
 * Runs the eval suite for one task. Returns an EvalReport whose `score` is the
 * fraction of cases that passed every check. Errors during a case are turned into
 * "failed checks" — the runner never throws for individual case failures.
 */
export async function runEvalSuite(
  taskId: string,
  opts: { live?: boolean; version?: number | "active" } = {},
): Promise<EvalReport> {
  const task = getTask(taskId);
  const cases = await loadCases(task.evalSuite);
  const results: CaseResult[] = [];
  const ranAt = new Date().toISOString();

  for (const c of cases) {
    const start = Date.now();
    try {
      const out = await runTask({
        task: taskId,
        input: c.input,
        actor: { type: "SYSTEM", job: "platform.eval-run" },
      });
      const checks = runBasicChecks(c, out.output);
      results.push({
        id: c.id,
        pass: checks.every((ch) => ch.pass),
        checks,
        latencyMs: Date.now() - start,
        costMicros: out.usage.costMicros,
      });
    } catch (err) {
      results.push({
        id: c.id,
        pass: false,
        checks: [
          {
            name: "runTask",
            pass: false,
            message: err instanceof Error ? err.message : "Unknown error",
          },
        ],
        latencyMs: Date.now() - start,
        costMicros: 0,
      });
    }
  }

  const passed = results.filter((r) => r.pass).length;
  return {
    task: taskId,
    version: opts.version ?? "active",
    live: opts.live ?? false,
    ranAt,
    totalCases: results.length,
    passed,
    score: results.length === 0 ? 1 : passed / results.length,
    totalCostMicros: results.reduce((s, r) => s + r.costMicros, 0),
    cases: results,
  };
}

/** Slim wrapper used by prompt-versions.publishPromptVersion. */
export async function runEvalSuiteForPublish(
  taskId: string,
): Promise<{ score: number; reportKey: string | null }> {
  const report = await runEvalSuite(taskId);
  return { score: report.score, reportKey: null };
}
