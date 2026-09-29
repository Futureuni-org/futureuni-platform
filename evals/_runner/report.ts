import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EvalReport } from "./types";

const REPORTS_DIR = path.join(process.cwd(), "evals", "reports");

/** Writes a report JSON file and returns its path. */
export async function writeReport(report: EvalReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const safeTask = report.task.replace(/[^a-z0-9._-]/gi, "_");
  const filename = `${safeTask}-${String(Date.now())}.json`;
  const abs = path.join(REPORTS_DIR, filename);
  await writeFile(abs, JSON.stringify(report, null, 2), "utf8");
  return abs;
}

/** Prints a human-readable table to stdout. */
export function printReport(report: EvalReport): void {
  const header = `\n${report.task}  v=${String(report.version)}  live=${String(report.live)}`;
  const summary = `  score: ${String(report.passed)}/${String(report.totalCases)} = ${(report.score * 100).toFixed(1)}%`;
  const cost = `  cost: $${(report.totalCostMicros / 1_000_000).toFixed(6)}`;
  const lines = [header, summary, cost, ""];
  for (const c of report.cases) {
    const mark = c.pass ? "PASS" : "FAIL";
    lines.push(`  [${mark}] ${c.id}  (${String(c.latencyMs)} ms)`);
    for (const check of c.checks) {
      if (!check.pass) lines.push(`      ${check.name}: ${check.message ?? "failed"}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}
