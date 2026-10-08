import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/*
 * Unit, component and (from Phase 2) integration tests. Tests sit next to their code.
 * - `dom` project: *.test.tsx in jsdom (components and hooks), with jest-dom matchers.
 * - `node` project: *.test.ts in Node (services, scripts, route handlers).
 * MSW fails any request that no test handles: no real network in tests (project-rules §Bans).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 reads tsconfig "paths" itself (@/platform/*, @/lib/*, ...).
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside a React server bundle; tests import server modules directly.
      "server-only": fromRoot("./tests/setup/server-only-stub.ts"),
    },
  },
  test: {
    // Integration tests share one Postgres database and some commit globally-visible rows (e.g. an
    // active admin for a service test). The acceptance tests assert on global state (the
    // last-active-admin invariant), so test files must not run concurrently or they see each other's
    // committed rows. Serialise files; tests within a file already run in order.
    fileParallelism: false,
    // Vitest's 5s default suits pure unit tests, but integration tests here migrate, write and read
    // real rows (and render a PDF), which outgrows it on a loaded or low-memory machine. A test that
    // times out keeps running, so its writes land in a later test's cleanup and fail it on a foreign
    // key — a misleading failure far from the cause. Individual slow tests still set their own.
    testTimeout: 30_000,
    // Applies pending migrations to the test database once, before any test file runs.
    globalSetup: ["./tests/setup/migrate-test-db.ts"],
    setupFiles: ["./tests/setup/test-env.ts", "./tests/setup/msw.ts"],
    exclude: [
      ...configDefaults.exclude,
      ".next/**",
      "scripts/lint-fixtures/**",
      "tests/e2e/**",
      ".claude/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.d.{ts,mts}",
        "src/generated/**",
        "scripts/lint-fixtures/**",
      ],
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
          setupFiles: ["./tests/setup/dom.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
    ],
  },
});
