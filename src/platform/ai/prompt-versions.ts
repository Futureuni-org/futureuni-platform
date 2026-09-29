import "server-only";

/**
 * Prompt-version management (Phase 5 services; Phase 18 UI).
 *
 *  - publishPromptVersion: compiles the current prompt, runs the eval suite in mock mode,
 *    refuses when the score drops by more than the configured tolerance, then creates a
 *    new PromptVersion row (isActive: false). Audit via SEAM-AUDIT.
 *  - activatePromptVersion: flips isActive to the target version in one transaction.
 *  - listPromptVersions / diffPromptVersions: read-only helpers Phase 18 uses.
 */

import type {
  ActivatePromptVersion,
  PublishPromptVersion,
  TaskId,
} from "@/contracts/ai-service";
import { db, withTransaction } from "@/platform/db";
import { AppError } from "@/lib/errors";

import { getTask } from "./registry";
import { compileFullPrompt } from "./skills/compile";
import { assertActorCan, recordAudit } from "./_seams";

/** Score-regression tolerance: publish is refused when new < active - tolerance without force. */
export const EVAL_REGRESSION_TOLERANCE = 0.02;

/**
 * The evaluation hook. We keep it injectable so tests can pin a score without loading the
 * eval runner (and so a broken runner does not block prompt-version tests).
 */
export type EvalHook = (taskId: TaskId) => Promise<{ score: number; reportKey: string | null }>;

let runEvals: EvalHook = async (_taskId) => {
  // Deferred import — the eval runner lives under evals/_runner (Phase 5), outside src/.
  const runner = await import("../../../evals/_runner/run");
  return runner.runEvalSuiteForPublish(_taskId);
};

/** For tests: replace the eval hook. */
export function setEvalHookForTesting(hook: EvalHook): void {
  runEvals = hook;
}

export const publishPromptVersion: PublishPromptVersion = async (
  actor,
  task,
  note,
  opts = {},
) => {
  assertActorCan(actor, "platform.prompt.publish");
  const taskDef = getTask(task);

  const compiled = await compileFullPrompt(taskDef);

  // Refuse a no-op publish (same content as active).
  const active = await db.promptVersion.findFirst({
    where: { task, isActive: true },
    select: { id: true, version: true, contentHash: true, evalScore: true },
  });
  if (active !== null && active.contentHash === compiled.contentHash) {
    throw new AppError("CONFLICT", "Prompt content is identical to the active version.", {
      details: { task, contentHash: compiled.contentHash },
    });
  }

  // Run evals in mock mode and gate the publish.
  const { score, reportKey } = await runEvals(task);
  const previousScore = active?.evalScore ?? null;
  if (
    previousScore !== null &&
    !opts.force &&
    score < previousScore - EVAL_REGRESSION_TOLERANCE
  ) {
    throw new AppError("VALIDATION_FAILED", "Eval score regressed vs active version.", {
      details: { task, previousScore, score, tolerance: EVAL_REGRESSION_TOLERANCE, reportKey },
    });
  }

  const version = await withTransaction(async (tx) => {
    const maxRow = await tx.promptVersion.aggregate({
      _max: { version: true },
      where: { task },
    });
    const nextVersion = (maxRow._max.version ?? 0) + 1;
    const row = await tx.promptVersion.create({
      data: {
        task,
        version: nextVersion,
        contentHash: compiled.contentHash,
        compiledPrompt: compiled.text,
        changelog: note,
        authorId: actor.type === "USER" ? actor.userId : "system",
        evalScore: score,
        evalReportKey: reportKey,
        isActive: false,
      },
      select: { id: true, version: true },
    });
    await recordAudit(tx, {
      actor,
      action: "platform.prompt.publish",
      targetType: "PromptVersion",
      targetId: row.id,
      after: {
        task,
        version: row.version,
        evalScore: score,
        force: opts.force ?? false,
        forceReason: opts.forceReason,
      },
    });
    return row.version;
  });

  return { version, evalScore: score, previousScore };
};

export const activatePromptVersion: ActivatePromptVersion = async (actor, task, version) => {
  assertActorCan(actor, "platform.prompt.activate");
  await withTransaction(async (tx) => {
    const target = await tx.promptVersion.findFirst({
      where: { task, version },
      select: { id: true, isActive: true },
    });
    if (target === null) {
      throw new AppError("NOT_FOUND", `Prompt version ${String(version)} for ${task} not found`);
    }
    // Deactivate current active (if any).
    await tx.promptVersion.updateMany({
      where: { task, isActive: true },
      data: { isActive: false },
    });
    await tx.promptVersion.update({
      where: { id: target.id },
      data: { isActive: true, activatedAt: new Date() },
    });
    await recordAudit(tx, {
      actor,
      action: "platform.prompt.activate",
      targetType: "PromptVersion",
      targetId: target.id,
      after: { task, version },
    });
  });
};

export interface PromptVersionRow {
  id: string;
  task: string;
  version: number;
  contentHash: string;
  changelog: string;
  authorId: string;
  evalScore: number | null;
  isActive: boolean;
  publishedAt: Date;
  activatedAt: Date | null;
}

export async function listPromptVersions(task: TaskId): Promise<PromptVersionRow[]> {
  const rows = await db.promptVersion.findMany({
    where: { task },
    orderBy: { version: "desc" },
    select: {
      id: true,
      task: true,
      version: true,
      contentHash: true,
      changelog: true,
      authorId: true,
      evalScore: true,
      isActive: true,
      publishedAt: true,
      activatedAt: true,
    },
  });
  return rows;
}

export async function diffPromptVersions(
  task: TaskId,
  a: number,
  b: number,
): Promise<{ a: string; b: string }> {
  const rows = await db.promptVersion.findMany({
    where: { task, version: { in: [a, b] } },
    select: { version: true, compiledPrompt: true },
  });
  const A = rows.find((r) => r.version === a)?.compiledPrompt;
  const B = rows.find((r) => r.version === b)?.compiledPrompt;
  if (A === undefined || B === undefined) {
    throw new AppError("NOT_FOUND", "One or both prompt versions not found", {
      details: { task, a, b },
    });
  }
  return { a: A, b: B };
}
