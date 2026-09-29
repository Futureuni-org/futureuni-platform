#!/usr/bin/env tsx

/**
 * `pnpm evals [taskId] [--version N] [--live]` — the eval runner CLI.
 *
 * Defaults to mock mode; `--live` uses the real API respecting EVALS_LIVE_MAX_USD.
 * When no taskId is given, runs every registered task's suite.
 *
 * .env.local is loaded via dotenv BEFORE any module that touches @/env is imported.
 * In ES modules imports run before top-level statements, so we can't just call
 * `loadDotenv()` here and then `import ...` — we have to dynamic-import after.
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local", quiet: true });
loadDotenv({ path: ".env", quiet: true });

interface ParsedArgs {
  taskId: string | null;
  version: number | "active";
  live: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let taskId: string | null = null;
  let version: number | "active" = "active";
  let live = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--live") live = true;
    else if (a === "--version") {
      const next = argv[i + 1];
      if (next === undefined) throw new Error("--version needs a number");
      version = Number.parseInt(next, 10);
      i += 1;
    } else if (a !== undefined && !a.startsWith("--")) {
      taskId = a;
    }
  }
  return { taskId, version, live };
}

async function main(): Promise<void> {
  // The @/platform/ai import runs side-effect registrations (registerPlatformTasks +
  // bootRegistry). We keep it in the destructure so the loader records the dependency,
  // and use its .runTask export as the "did it load?" proof rather than a bare void.
  const [aiModule, registryModule, runModule, reportModule] = await Promise.all([
    import("@/platform/ai"),
    import("@/platform/ai/registry"),
    import("./run"),
    import("./report"),
  ]);
  if (typeof aiModule.runTask !== "function") {
    throw new Error("Failed to load @/platform/ai");
  }

  const args = parseArgs(process.argv.slice(2));
  const tasks = args.taskId === null ? registryModule.listRegisteredTaskIds() : [args.taskId];
  let anyFailed = false;
  for (const t of tasks) {
    const report = await runModule.runEvalSuite(t, { live: args.live, version: args.version });
    reportModule.printReport(report);
    await reportModule.writeReport(report);
    if (report.passed < report.totalCases) anyFailed = true;
  }
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
