import "server-only";

/**
 * Compiles a full prompt snapshot for a task at a specific point in time — used only for
 * PromptVersion.compiledPrompt and its contentHash. This DOES NOT include per-call input.
 *
 * The compiled prompt is the concatenation of every skill file the task loads for a
 * canonical "empty" input, using the ReferenceSelector's optional-off path where possible.
 */

import { createHash } from "node:crypto";

import type { AnyTaskDefinition } from "@/contracts/ai-service";

import { composeSystemPrompt } from "./loader";

export interface CompiledPrompt {
  text: string;
  contentHash: string;
}

/** Uses `sampleInput` (typically an empty object) to drive the ReferenceSelector. */
export async function compileFullPrompt(
  task: AnyTaskDefinition,
  sampleInput: unknown = {},
): Promise<CompiledPrompt> {
  const { fullText } = await composeSystemPrompt(task, sampleInput);
  const contentHash = createHash("sha256").update(fullText).digest("hex");
  return { text: fullText, contentHash };
}
