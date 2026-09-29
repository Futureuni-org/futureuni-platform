import "server-only";

/**
 * Reads a reference file from disk, relative to the runtime-skills/ root. Missing optional
 * references are logged and skipped in development; missing required references throw
 * AppError("INTERNAL") (wave-2 tightens this for acquisition tasks).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@/lib/errors";

const SKILLS_ROOT = path.join(process.cwd(), "runtime-skills");

export interface ReferenceRef {
  path: string; // relative to runtime-skills/, no leading slash
  optional?: boolean;
}

export async function loadReference(ref: ReferenceRef): Promise<string | null> {
  const abs = path.join(SKILLS_ROOT, ref.path);
  try {
    return await readFile(abs, "utf8");
  } catch (cause) {
    if (ref.optional) {
      console.warn(
        JSON.stringify({
          event: "ai.reference.missing",
          path: ref.path,
          reason: (cause as { code?: string }).code ?? "unknown",
        }),
      );
      return null;
    }
    throw new AppError("INTERNAL", `Missing required reference: ${ref.path}`, { cause });
  }
}

export async function loadSkillFile(skillFolder: string, filename: string): Promise<string> {
  const abs = path.join(SKILLS_ROOT, skillFolder, filename);
  try {
    return await readFile(abs, "utf8");
  } catch (cause) {
    throw new AppError("INTERNAL", `Missing skill file: ${skillFolder}/${filename}`, { cause });
  }
}
