/**
 * `defineTask` — a pure identity-cast that lets a module export a typed AI task without
 * importing the runtime registry (which pulls in `getAllAiTasks` → the module registry → every
 * manifest, creating a circular import for any manifest whose tasks re-import from
 * `@/platform/ai`).
 *
 * Keep this file free of platform-registry imports.
 */

import "server-only";

import type {
  AnyTaskDefinition,
  DefineTask,
  TaskDefinition,
} from "@/contracts/ai-service";

export const defineTask: DefineTask = <TInput, TOutput>(
  def: TaskDefinition<TInput, TOutput>,
): AnyTaskDefinition => def as unknown as AnyTaskDefinition;
