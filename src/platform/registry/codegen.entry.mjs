/*
 * Entry point for `pnpm registry:gen`. Loads .env.local (via Node's dotenv-format util.parseEnv)
 * and sets SKIP_ENV_VALIDATION BEFORE dynamically importing codegen.ts. ES module static imports
 * are hoisted, so we can't set this env var inside codegen.ts itself — the imports there would
 * already have invoked env.ts's top-level parse.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const envLocal = join(repoRoot, ".env.local");
if (existsSync(envLocal)) {
  const parsed = parseEnv(readFileSync(envLocal, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value;
  }
}
process.env.SKIP_ENV_VALIDATION ??= "1";

await import("./codegen.ts");
