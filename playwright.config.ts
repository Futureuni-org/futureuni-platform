import { join } from "node:path";

import { defineConfig } from "@playwright/test";

import { readEnvFile, REPO_ROOT } from "./scripts/lib/env-file.mjs";

/*
 * End-to-end tests (saas-testing). Specs live in tests/e2e/phase-<nn>/; critical journeys carry
 * the @smoke tag (`pnpm test:e2e --grep @smoke`).
 *
 * - Runs against a production build (`pnpm build && pnpm start`) with MOCKS=true, on its own port
 *   (PORT + 1000) so it never collides with a dev server. E2E_BASE_URL targets a deployed
 *   preview instead, and then no server is started.
 * - Locally it uses the installed Google Chrome (PW_CHANNEL=msedge for Edge), so no browser
 *   download is needed. CI installs Playwright's Chromium and leaves the channel unset.
 * - Viewports are set by hand: the mobile device presets would require WebKit.
 */

const isCI = process.env.CI !== undefined && process.env.CI !== "";
// Each phase worktree has its own PORT in .env.local (3000 + phase), so e2e servers never collide.
const devPort = Number(process.env.PORT ?? readEnvFile(join(REPO_ROOT, ".env.local")).PORT ?? 3000);
const port = Number(process.env.E2E_PORT ?? devPort + 1000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${String(port)}`;
const channel = isCI ? undefined : (process.env.PW_CHANNEL ?? "chrome");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // Retries on CI collect traces; they never hide a flaky test.
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET === undefined
      ? {}
      : {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          },
        }),
  },
  projects: [
    {
      name: "desktop",
      use: {
        browserName: "chromium",
        ...(channel === undefined ? {} : { channel }),
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        ...(channel === undefined ? {} : { channel }),
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  ...(process.env.E2E_BASE_URL === undefined
    ? {
        webServer: {
          command: "pnpm build && pnpm start",
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 300_000,
          env: { MOCKS: "true", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1" },
          stdout: "ignore",
          stderr: "pipe",
        },
      }
    : {}),
});
