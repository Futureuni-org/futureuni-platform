// Pure helpers for scripts/phase.mjs (pnpm phase ...): names, ports and .env.local rewriting.

import { basename, dirname, join } from "node:path";

export const USAGE = `Usage:
  pnpm phase start <nn> <slug>   create ../<repo>-<nn>-<slug> on branch phase/<nn>-<slug>, with its own databases and port
  pnpm phase list                list phase worktrees
  pnpm phase finish <nn>         check SUMMARY.md and run pnpm check in the worktree, then print the merge steps
  pnpm phase remove <nn> [--yes] [--force]
                                 remove the worktree and drop its databases (asks first unless --yes)`;

/** Parses `pnpm phase` arguments; throws a usage error on anything invalid. */
export function parsePhaseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const [command, nn, slug] = argv.filter((arg) => !arg.startsWith("--"));
  const unknownFlags = [...flags].filter((flag) => flag !== "--yes" && flag !== "--force");
  if (unknownFlags.length > 0)
    throw new Error(`Unknown option ${unknownFlags.join(", ")}\n\n${USAGE}`);

  if (command === "list") return { command };
  if (command !== "start" && command !== "finish" && command !== "remove") throw new Error(USAGE);
  if (nn === undefined || !/^\d{2}$/.test(nn))
    throw new Error(`The phase number must be two digits, like 05.\n\n${USAGE}`);
  if (command === "start") {
    if (slug === undefined || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug)) {
      throw new Error(
        `The slug must be lowercase letters, digits and dashes, like ai-service.\n\n${USAGE}`,
      );
    }
    return { command, nn, slug };
  }
  return { command, nn, yes: flags.has("--yes"), force: flags.has("--force") };
}

export function branchName(nn, slug) {
  return `phase/${nn}-${slug}`;
}

/** The sibling folder for a phase worktree: ../<repo>-<nn>-<slug>. */
export function worktreePath(mainRoot, nn, slug) {
  return join(dirname(mainRoot), `${basename(mainRoot)}-${nn}-${slug}`);
}

export function phasePort(nn) {
  return 3000 + Number(nn);
}

export function phaseDatabases(nn) {
  return { dev: `futureuni_p${nn}`, test: `futureuni_test_p${nn}` };
}

function withDatabaseName(url, name) {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

function withPort(url, port) {
  const next = new URL(url);
  next.port = String(port);
  return next.toString().replace(/\/$/, "");
}

/** The .env.local values a phase worktree changes: its own databases, port and URLs. */
export function phaseEnvValues(mainEnv, nn) {
  const port = phasePort(nn);
  const { dev, test } = phaseDatabases(nn);
  const required = (key) => {
    const value = mainEnv[key];
    if (value === undefined || value === "")
      throw new Error(`${key} is missing from the main .env.local`);
    return value;
  };
  const appUrl = mainEnv.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const authUrl = mainEnv.BETTER_AUTH_URL || appUrl;
  return {
    DATABASE_URL: withDatabaseName(required("DATABASE_URL"), dev),
    DIRECT_URL: withDatabaseName(mainEnv.DIRECT_URL || required("DATABASE_URL"), dev),
    DATABASE_URL_TEST: withDatabaseName(
      mainEnv.DATABASE_URL_TEST || required("DATABASE_URL"),
      test,
    ),
    PORT: String(port),
    NEXT_PUBLIC_APP_URL: withPort(appUrl, port),
    BETTER_AUTH_URL: withPort(authUrl, port),
  };
}

/** The "Merge procedure" section of phases/README.md, to print when a phase finishes. */
export function mergeProcedure(readme) {
  const start = readme.indexOf("## Merge procedure");
  if (start === -1) return 'See phases/README.md, section "Merge procedure".';
  const rest = readme.slice(start);
  const end = rest.indexOf("\n## ", 3);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/** Parses `git worktree list --porcelain` into { path, branch } entries. */
export function parseWorktreeList(porcelain) {
  return porcelain
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const path = /^worktree (.+)$/m.exec(block)?.[1];
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
      return path === undefined ? null : { path, branch };
    })
    .filter((entry) => entry !== null);
}
