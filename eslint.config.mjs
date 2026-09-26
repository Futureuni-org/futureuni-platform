// ESLint flat config: Next.js core-web-vitals + typescript-eslint strict and stylistic
// (type-checked), plus the project rules from .claude/project-rules.md §Bans.
// scripts/lint-rules.test.ts proves the project rules fire, using scripts/lint-fixtures/.

import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import boundaries from "eslint-plugin-boundaries";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];
const JS_FILES = ["**/*.{js,jsx,mjs,cjs}"];
const CODE_FILES = [...TS_FILES, ...JS_FILES];

// ---- Project bans (project-rules §Bans) ---------------------------------------------------
// Import restrictions are regexes on the import source, so they catch aliases, relative paths
// and subpaths alike; the same regexes flag dynamic import(). Rule options don't merge across
// config blocks, so every folder block gets the complete set from `bans()`.

const ANTHROPIC_MESSAGE =
  "Call Claude only through the platform AI service (@/platform/ai, ADR-006).";
const PRISMA_MESSAGE =
  "The Prisma client is only for src/platform/db/**, prisma/** and *.repo.ts files. Use @/platform/db or a repo.";
const ENUMS_ONLY_MESSAGE =
  "Contracts may import only the generated enums (@/generated/prisma/enums), never the client.";

const ANTHROPIC_SOURCE = "^@anthropic-ai/sdk(?:/|$)";
const PRISMA_SOURCE = "^@prisma/client(?:/|$)|(?:^@/|/)generated/prisma(?:/|$)";
const PRISMA_EXCEPT_ENUMS_SOURCE =
  "^@prisma/client(?:/|$)|(?:^@/|/)generated/prisma(?!/enums$)(?:/|$)";

// No raw colours outside the token files: hex colours and colour functions in string and
// template literals, including Tailwind arbitrary values such as "bg-[#fff]". References such
// as `rgb(var(--x))` are allowed. Known gap: a URL fragment spelled like a hex colour ("#add").
const HEX = "#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])";
const COLOUR_FUNCTION = String.raw`\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?!\s*var\()`;
const COLOUR = `/${HEX}|${COLOUR_FUNCTION}/i`;
const COLOUR_MESSAGE =
  "Hard-coded colour: use a design token (src/styles/tokens.css) through a Tailwind class.";

// esquery regex literals can't contain a bare "/", so it's written as \u002F there.
const asSelectorRegex = (source) => `/${source.replaceAll("/", String.raw`\u002F`)}/`;

/**
 * The project's import and syntax bans for one group of files.
 * @param {{ anthropic?: boolean, prisma?: "banned" | "enums-only" | "allowed", colours?: boolean }} options
 */
function bans({ anthropic = true, prisma = "banned", colours = true } = {}) {
  const sources = [
    ...(anthropic ? [{ regex: ANTHROPIC_SOURCE, message: ANTHROPIC_MESSAGE }] : []),
    ...(prisma === "banned" ? [{ regex: PRISMA_SOURCE, message: PRISMA_MESSAGE }] : []),
    ...(prisma === "enums-only"
      ? [{ regex: PRISMA_EXCEPT_ENUMS_SOURCE, message: ENUMS_ONLY_MESSAGE }]
      : []),
  ];
  const syntax = [
    ...sources.map(({ regex, message }) => ({
      selector: `ImportExpression[source.value=${asSelectorRegex(regex)}]`,
      message,
    })),
    ...(colours
      ? [
          { selector: `Literal[value=${COLOUR}]`, message: COLOUR_MESSAGE },
          { selector: `TemplateElement[value.raw=${COLOUR}]`, message: COLOUR_MESSAGE },
        ]
      : []),
  ];
  return {
    "no-restricted-imports": sources.length > 0 ? ["error", { patterns: sources }] : "off",
    "no-restricted-syntax": syntax.length > 0 ? ["error", ...syntax] : "off",
  };
}

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    ".playwright-mcp/**",
    ".claude/**",
    "next-env.d.ts",
    "src/generated/**",
    "src/app/.well-known/**",
    // Deliberately broken files, linted only by scripts/lint-rules.test.ts.
    "scripts/lint-fixtures/**",
  ]),

  // eslint-disable comments are banned (project-rules §Bans): inline config is ignored, and
  // any such comment is reported (as a warning, which the lint script treats as a failure).
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
  },

  ...nextVitals,

  {
    files: CODE_FILES,
    extends: [js.configs.recommended],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      ...bans(),
    },
  },

  {
    files: TS_FILES,
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
      // Module augmentation (for example the jest-dom matchers for Vitest) needs `interface X extends Y {}`.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    },
  },

  // Declaration files describe shapes: declaration merging must repeat type parameters exactly,
  // even ones the augmentation doesn't use (tests/setup/jest-dom-vitest.d.ts).
  {
    files: ["**/*.d.ts", "**/*.d.mts"],
    rules: { "@typescript-eslint/no-unused-vars": "off" },
  },

  // The token files are the one place raw colours live.
  {
    files: ["src/styles/**", "src/lib/chart-theme.ts"],
    rules: bans({ colours: false }),
  },

  // Folders allowed to use one restricted package.
  {
    files: ["src/platform/ai/**"],
    rules: bans({ anthropic: false }),
  },
  {
    files: ["src/platform/db/**", "prisma/**", "**/*.repo.ts"],
    rules: bans({ prisma: "allowed" }),
  },
  {
    files: ["src/contracts/**"],
    rules: bans({ prisma: "enums-only" }),
  },

  // Module boundaries (ADR-002): a module never imports another module, and the platform
  // never imports a module, except the generated registry (Phase 2).
  {
    files: ["src/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    plugins: { boundaries },
    settings: {
      // Element patterns are relative to the repository root, wherever ESLint is launched from.
      "boundaries/root-path": import.meta.dirname,
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "module", pattern: "src/modules/*", capture: ["moduleName"] },
        { type: "platform", pattern: "src/platform" },
      ],
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          // The second project is the lint fixtures' mini-root (scripts/lint-rules.test.ts).
          project: ["tsconfig.json", "scripts/lint-fixtures/tsconfig.json"],
          noWarnOnMultipleProjects: true,
        },
        node: true,
      },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          // Later policies override earlier ones.
          policies: [
            {
              from: { element: { type: "module" } },
              disallow: { to: { element: { type: "module" } } },
              message:
                "Modules never import another module. Use @/platform, @/contracts, @/components, @/lib or an event.",
            },
            {
              from: { element: { type: "module" } },
              allow: {
                to: {
                  element: {
                    type: "module",
                    captured: { moduleName: "{{from.element.captured.moduleName}}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "platform" } },
              disallow: { to: { element: { type: "module" } } },
              message:
                "The platform never imports a module, except the generated registry (src/platform/registry/generated.ts).",
            },
            {
              from: { element: { type: "platform", fileInternalPath: "registry/generated.ts" } },
              allow: { to: { element: { type: "module" } } },
            },
          ],
        },
      ],
    },
  },

  // Plain JavaScript (config files and scripts): Node globals, no type information.
  {
    files: JS_FILES,
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  // Formatting belongs to Prettier.
  prettier,
]);
