import "server-only";

/**
 * Composes the system-prompt content blocks for one call. Order is fixed so prompt caching
 * has stable prefixes:
 *
 *   1. Shared skills (each _shared/<name>/SKILL.md) — usually just futureuni-voice.
 *   2. Task SKILL.md.
 *   3. Selected references (order-preserving), from the task's ReferenceSelector.
 *   4. Examples if present in the skill folder.
 *   5. Cache breakpoint (cache_control: ephemeral, ttl: "5m") — set on the LAST block above.
 *
 * The per-call user input goes in the messages array afterwards and is NOT part of the
 * cached prefix. Untrusted per-call content must be wrapped by wrapUntrusted() by the caller.
 */

import type { AnyTaskDefinition } from "@/contracts/ai-service";

import { loadReference, loadSkillFile, type ReferenceRef } from "./references";

export interface SystemBlock {
  type: "text";
  text: string;
  /** True on the last stable block to open a 5-minute cache breakpoint. */
  cache: boolean;
}

export interface ComposedSystem {
  blocks: SystemBlock[];
  /** For hashing / storage: the concatenated system text without cache_control metadata. */
  fullText: string;
}

/**
 * Reads each skill file from disk and returns the composed system prompt.
 * `input` is passed only to the task's ReferenceSelector; it is typed as `unknown` here
 * because Phase 5 works over the type-erased AnyTaskDefinition.
 */
export async function composeSystemPrompt(
  task: AnyTaskDefinition,
  input: unknown,
): Promise<ComposedSystem> {
  const parts: string[] = [];

  // 1. Shared skills, in listed order.
  for (const shared of task.sharedSkills) {
    parts.push(await loadSkillFile(shared, "SKILL.md"));
  }

  // 2. Task SKILL.md.
  parts.push(await loadSkillFile(task.skillPath, "SKILL.md"));

  // 3. Selected references (optional per ref).
  const refs: ReferenceRef[] =
    task.references === undefined
      ? []
      : (task.references as (i: unknown) => ReferenceRef[])(input);
  for (const ref of refs) {
    const body = await loadReference(ref);
    if (body !== null) parts.push(body);
  }

  const blocks: SystemBlock[] = parts.map((text, index) => ({
    type: "text",
    text,
    cache: task.cacheableSystem && index === parts.length - 1,
  }));

  return { blocks, fullText: parts.join("\n\n") };
}
