/**
 * `pnpm create-module <id> "<Name>"` (docs/specs/platform.md §3.14). Copies
 * templates/create-module/ into src/modules/<id>/ and src/app/(platform)/<id>/, replaces the
 * tokens, runs `pnpm registry:gen` and prints the next steps.
 *
 * The id is lower-case letters only: it becomes the first segment of the module's permissions,
 * jobs, AI tasks and events, and the job and task name patterns allow only letters there.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { CORE_MODULE_ID, RESERVED_ROUTE_PREFIXES } from "./validate";

export const MODULE_ID_PATTERN = /^[a-z]{2,32}$/;
/**
 * The display name goes into TypeScript strings and JSX text as is, so it's limited to characters
 * that need no escaping there: letters, digits, spaces and & , . ( ) / -.
 */
export const MODULE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 &,.()/-]{1,39}$/;
const TEMPLATE_DIR = join("templates", "create-module");

export interface CreateModuleOptions {
  root: string;
  id: string;
  name: string;
}

/** Why an id can't be used, or null when it can. */
export function moduleIdProblem(root: string, id: string): string | null {
  if (!MODULE_ID_PATTERN.test(id)) {
    return `"${id}" isn't a valid module id: use 2–32 lower-case letters (for example "marketing").`;
  }
  const reserved = new Set<string>([
    CORE_MODULE_ID,
    ...RESERVED_ROUTE_PREFIXES.map((prefix) => prefix.slice(1)),
  ]);
  if (reserved.has(id)) return `"${id}" is reserved by the platform core.`;
  if (existsSync(join(root, "src", "modules", id))) return `src/modules/${id} already exists.`;
  if (existsSync(join(root, "src", "app", "(platform)", id)))
    return `src/app/(platform)/${id} already exists.`;
  return null;
}

function tokensFor(id: string, name: string): Record<string, string> {
  return {
    __MODULE_ID__: id,
    __MODULE_NAME__: name,
    __ROUTE_PREFIX__: `/${id}`,
    __MODULE_COMPONENT__: id.charAt(0).toUpperCase() + id.slice(1),
  };
}

function render(source: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    source,
  );
}

function templateFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return templateFiles(path);
    return entry.name.endsWith(".tpl") ? [path] : [];
  });
}

/** Writes the module's files; returns the paths written, relative to the root. */
export function createModuleFiles({ root, id, name }: CreateModuleOptions): string[] {
  const problem = moduleIdProblem(root, id);
  if (problem !== null) throw new Error(problem);
  if (!MODULE_NAME_PATTERN.test(name.trim()))
    throw new Error(
      "The module name must be 2–40 characters: letters, digits, spaces and & , . ( ) / - only, starting with a letter.",
    );

  const tokens = tokensFor(id, name.trim());
  const templateRoot = join(root, TEMPLATE_DIR);
  const targets: [string, string][] = [
    ...templateFiles(join(templateRoot, "module")).map((file): [string, string] => [
      file,
      join(
        root,
        "src",
        "modules",
        id,
        relative(join(templateRoot, "module"), file).replace(/\.tpl$/, ""),
      ),
    ]),
    [
      join(templateRoot, "app", "page.tsx.tpl"),
      join(root, "src", "app", "(platform)", id, "page.tsx"),
    ],
  ];
  for (const [from, to] of targets) {
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, render(readFileSync(from, "utf8"), tokens));
  }
  return targets.map(([, to]) => relative(root, to).replaceAll("\\", "/"));
}

function main(): void {
  const [id, name] = process.argv.slice(2);
  if (id === undefined || name === undefined) {
    console.error(
      'Usage: pnpm create-module <id> "<Name>"   (for example: pnpm create-module marketing "Marketing")',
    );
    process.exit(1);
  }
  const root = process.cwd();
  let written: string[];
  try {
    written = createModuleFiles({ root, id, name });
  } catch (error) {
    console.error(`error ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  for (const path of written) console.warn(`ok    wrote ${path}`);

  // Through pnpm's own entry point when run as a package script; otherwise through the shell.
  const execPath = process.env.npm_execpath;
  const registry =
    execPath !== undefined && execPath !== ""
      ? spawnSync(process.execPath, [execPath, "registry:gen"], { cwd: root, stdio: "inherit" })
      : spawnSync("pnpm", ["registry:gen"], { cwd: root, stdio: "inherit", shell: true });
  if (registry.status !== 0) {
    console.error("error pnpm registry:gen failed; fix the manifest above, then run it again.");
    process.exit(1);
  }

  console.warn(`
Next steps for the ${name} module:
  1. Write its spec: copy templates/create-module/SPEC_TEMPLATE.md to docs/specs/module-${id}.md
     and fill it in with the saas-plan skill.
  2. Add its phases' paths to scripts/ownership/ownership.json and the CLAUDE.md ownership table.
  3. Add prisma/schema/${id}.prisma with a short table prefix (for example "${id.slice(0, 3)}_"),
     relating to Company and Contact only by foreign key, then pnpm db:migrate --name add_${id}.
  4. Add its permissions to the matrix in .claude/project-rules.md.
  5. Run pnpm check.`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
