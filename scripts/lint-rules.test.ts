import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Proves the project lint rules fire (P1-AC6), using the real eslint.config.mjs on the
 * deliberately broken files in scripts/lint-fixtures/. That folder is a small project root
 * (its own src/ and tsconfig.json), so the path-based rules match as they do in src/.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixturesRoot = path.join(repoRoot, "scripts", "lint-fixtures");

let results = new Map<string, string[]>();

beforeAll(async () => {
  const eslint = new ESLint({
    cwd: fixturesRoot,
    overrideConfigFile: path.join(repoRoot, "eslint.config.mjs"),
    // The fixtures are ignored in the normal lint run; lint them here on purpose.
    ignore: false,
    // Module boundaries are measured from the fixtures root, as they are from the repo root.
    overrideConfig: { settings: { "boundaries/root-path": fixturesRoot } },
  });
  const lintResults = await eslint.lintFiles(["src/**/*.{ts,tsx,js}"]);
  results = new Map(
    lintResults.map((result) => {
      const fatal = result.messages.filter((message) => message.fatal === true);
      expect(fatal.map((message) => message.message)).toEqual([]);
      const file = path.relative(fixturesRoot, result.filePath).split(path.sep).join("/");
      return [file, result.messages.map((message) => message.ruleId ?? "unknown")];
    }),
  );
}, 180_000);

function rulesFor(file: string): string[] {
  const rules = results.get(file);
  if (rules === undefined) throw new Error(`fixture not linted: ${file}`);
  return rules;
}

describe("project lint rules", () => {
  it.each([
    ["src/modules/alpha/explicit-any.ts", "@typescript-eslint/no-explicit-any"],
    ["src/modules/alpha/imports-beta.ts", "boundaries/dependencies"],
    ["src/modules/alpha/imports-beta-relative.ts", "boundaries/dependencies"],
    ["src/platform/jobs/imports-module.ts", "boundaries/dependencies"],
    ["src/modules/alpha/uses-anthropic.ts", "no-restricted-imports"],
    ["src/modules/alpha/uses-prisma.ts", "no-restricted-imports"],
    ["src/components/raw-colours.tsx", "no-restricted-syntax"],
    ["src/modules/alpha/ts-ignore.ts", "@typescript-eslint/ban-ts-comment"],
    ["src/modules/alpha/non-null.ts", "@typescript-eslint/no-non-null-assertion"],
    ["src/modules/alpha/console-log.ts", "no-console"],
    ["src/modules/alpha/uses-generated-client.ts", "no-restricted-imports"],
    ["src/contracts/uses-client.ts", "no-restricted-imports"],
    ["src/modules/alpha/dynamic-anthropic.ts", "no-restricted-syntax"],
    ["src/modules/alpha/plain.js", "no-restricted-imports"],
    ["src/modules/alpha/plain.js", "no-restricted-syntax"],
    ["src/modules/alpha/cross.js", "boundaries/dependencies"],
    ["src/components/more-colours.tsx", "no-restricted-syntax"],
    // eslint-disable comments are ignored (noInlineConfig), so the rule still fires.
    ["src/modules/alpha/inline-disable.ts", "no-console"],
  ])("%s fires %s", (file, rule) => {
    expect(rulesFor(file)).toContain(rule);
  });

  it("flags every raw colour form: hex, arbitrary values, colour functions and template literals", () => {
    const colourFindings = (file: string) =>
      rulesFor(file).filter((rule) => rule === "no-restricted-syntax");
    // raw-colours.tsx: a hex literal, bg-[#fff] and rgb(); more-colours.tsx: hsl(), oklch() and a template literal.
    expect(colourFindings("src/components/raw-colours.tsx")).toHaveLength(3);
    expect(colourFindings("src/components/more-colours.tsx")).toHaveLength(3);
  });

  it("allows only console.warn and console.error", () => {
    expect(
      rulesFor("src/modules/alpha/console-log.ts").filter((rule) => rule === "no-console"),
    ).toHaveLength(1);
  });

  it.each([
    "src/modules/alpha/imports-own.ts",
    "src/platform/registry/generated.ts",
    "src/platform/ai/uses-anthropic.ts",
    "src/styles/allowed-colour.ts",
    "src/contracts/uses-enums.ts",
    "src/platform/db/uses-prisma.ts",
    "src/modules/alpha/users.repo.ts",
  ])("%s is allowed", (file) => {
    expect(rulesFor(file)).toEqual([]);
  });
});
