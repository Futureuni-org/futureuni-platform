/**
 * `pnpm jobs:run <name> '<json>'` — trigger a job by hand through the inline runner.
 *
 * Uses the inline runner (not Workflow) so it works locally without deploying. Prints the JobRun
 * id, status and any error summary. Exits non-zero on failure.
 */

import { disconnectDb } from "@/platform/db";

import { runJobInline } from "./inline";

async function main(): Promise<void> {
  const [, , name, jsonInput] = process.argv;
  if (typeof name !== "string" || name === "") {
    process.stderr.write("Usage: pnpm jobs:run <name> '<json>'\n");
    process.exit(1);
  }
  const input: unknown = jsonInput === undefined ? {} : JSON.parse(jsonInput);
  const result = await runJobInline(name, input, { actor: { type: "SYSTEM", job: "jobs-run" } });
  process.stdout.write(
    `[jobs:run] ${name} → ${result.status} (${result.jobRunId}): ${JSON.stringify(result.result)}\n`,
  );
  if (result.status === "FAILED") process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`[jobs:run] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
