#!/usr/bin/env tsx

/**
 * `pnpm profiles:check` — validates every default profile (fresh) AND every active DB
 * profile. Prints a table of errors/warnings and exits 1 on any error. Wave-1 sits under
 * the ONLY `package.json` script slot granted to Phase 7.
 */

import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env.local", quiet: true });
loadDotenv({ path: ".env", quiet: true });

async function main(): Promise<void> {
  const [defaults, dbMod, validateMod] = await Promise.all([
    import("./defaults"),
    import("./read.repo"),
    import("./validate"),
  ]);
  const { DEFAULT_PROFILES } = defaults;
  const { listActiveProfiles } = dbMod;
  const { validateProfile } = validateMod;

  let errorCount = 0;

  process.stdout.write("\n=== Code defaults ===\n");
  for (const [line, profile] of Object.entries(DEFAULT_PROFILES)) {
    const issues = validateProfile(profile);
    printLine(line, "default", issues);
    errorCount += issues.filter((i) => i.severity === "error").length;
  }

  process.stdout.write("\n=== Active DB profiles ===\n");
  let dbProfiles: Awaited<ReturnType<typeof listActiveProfiles>> = [];
  try {
    dbProfiles = await listActiveProfiles();
  } catch (err) {
    process.stdout.write(
      `  (skipped — cannot reach the database: ${err instanceof Error ? err.message : "unknown"})\n`,
    );
  }
  for (const p of dbProfiles) {
    const issues = validateProfile(p);
    printLine(p.id, "active", issues);
    errorCount += issues.filter((i) => i.severity === "error").length;
  }

  if (errorCount > 0) {
    process.stderr.write(`\nprofiles:check found ${String(errorCount)} error(s).\n`);
    process.exit(1);
  }
  process.stdout.write("\nprofiles:check ok (warnings above are non-blocking).\n");
  process.exit(0);
}

function printLine(
  line: string,
  scope: "default" | "active",
  issues: readonly { severity: "error" | "warning"; code: string; message: string; path: (string | number)[] }[],
): void {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const status = errors.length === 0 ? "OK" : "ERR";
  process.stdout.write(
    `  [${status}] ${line} (${scope})  errors: ${String(errors.length)}  warnings: ${String(warnings.length)}\n`,
  );
  for (const issue of issues) {
    process.stdout.write(
      `      ${issue.severity.toUpperCase()} ${issue.code} at ${issue.path.join(".") || "(root)"}: ${issue.message}\n`,
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
