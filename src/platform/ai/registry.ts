import "server-only";

/**
 * In-memory task registry. Boot-loads tasks from two sources:
 *
 *   1. Platform tasks registered directly by @/platform/ai/platform-tasks.
 *   2. Module manifests via @/platform/registry.getAllAiTasks() — modules attach their
 *      tasks to their manifest's aiTasks[]. Phase 5 does NOT scan module folders itself.
 *
 * Registration is idempotent: re-registering the same id with the same object is a no-op;
 * re-registering with a different definition throws (a manifest-time bug).
 */

import {
  TaskDefinitionMetaSchema,
  type AnyTaskDefinition,
  type DefineTask,
  type GetTask,
  type RegisterTask,
  type TaskDefinition,
  type TaskId,
} from "@/contracts/ai-service";
import { getAllAiTasks } from "@/platform/registry";
import { AppError } from "@/lib/errors";

const REGISTRY = new Map<TaskId, AnyTaskDefinition>();
let booted = false;

/** Idempotent boot — safe to call from module-scope index.ts and platform-tasks bootstrap. */
export function bootRegistry(): void {
  if (booted) return;
  booted = true;
  for (const task of getAllAiTasks()) {
    registerTaskInternal(task);
  }
}

/** Validates the meta shape, then puts the task in the map. */
function registerTaskInternal(def: AnyTaskDefinition): void {
  // Meta validation gives clean errors before typed use.
  const meta = TaskDefinitionMetaSchema.safeParse({
    id: def.id,
    module: def.module,
    description: def.description,
    skillPath: def.skillPath,
    sharedSkills: def.sharedSkills,
    modelTier: def.modelTier,
    defaultMaxTokens: def.defaultMaxTokens,
    defaultTemperature: def.defaultTemperature,
    effort: def.effort,
    vision: def.vision,
    cacheableSystem: def.cacheableSystem,
    piiPolicy: def.piiPolicy,
    claims: def.claims,
    logContent: def.logContent,
    timeoutMs: def.timeoutMs,
    streaming: def.streaming,
    evalSuite: def.evalSuite,
    mockFixture: def.mockFixture,
  });
  if (!meta.success) {
    throw new AppError("INTERNAL", `Invalid task definition for "${def.id}"`, {
      details: { issues: meta.error.issues },
    });
  }

  const existing = REGISTRY.get(def.id);
  if (existing !== undefined && existing !== def) {
    throw new AppError("INTERNAL", `Task "${def.id}" is already registered`);
  }
  REGISTRY.set(def.id, def);
}

export const registerTask: RegisterTask = <TInput, TOutput>(
  def: TaskDefinition<TInput, TOutput>,
) => {
  registerTaskInternal(def as unknown as AnyTaskDefinition);
};

export const defineTask: DefineTask = <TInput, TOutput>(
  def: TaskDefinition<TInput, TOutput>,
): AnyTaskDefinition => def as unknown as AnyTaskDefinition;

export const getTask: GetTask = (id) => {
  bootRegistry();
  const found = REGISTRY.get(id);
  if (!found) {
    throw new AppError("NOT_FOUND", `AI task "${id}" is not registered`);
  }
  return found;
};

export function listRegisteredTaskIds(): readonly TaskId[] {
  bootRegistry();
  return Array.from(REGISTRY.keys());
}

/** For tests only: forget everything so the boot path can be tested. */
export function __resetRegistryForTests(): void {
  REGISTRY.clear();
  booted = false;
}
