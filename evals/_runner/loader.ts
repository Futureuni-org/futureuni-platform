import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { EvalCaseSchema, type EvalCase } from "./types";

const REPO_ROOT = process.cwd();

export async function loadCases(taskEvalSuite: string): Promise<EvalCase[]> {
  const dir = path.join(REPO_ROOT, taskEvalSuite, "cases");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();
  const out: EvalCase[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(path.join(dir, file), "utf8");
    const parsed = EvalCaseSchema.parse(JSON.parse(raw));
    out.push(parsed);
  }
  return out;
}
