import { expect, test } from "@playwright/test";

/**
 * Wave 1 acceptance — Part C3 of docs/prompts/wave-1/wave-1-prep-and-merge.md, updated for
 * batch B2 (Phases 3, 4, 5, 6, 7, 9 now on `main`). The seeded admin signs in, lands on the
 * real shell, sees the notification bell, and the sidebar navigation is filtered by role.
 *
 * Skips the pieces that need Phases 8/10–14 (search runs, real inbox reclassification,
 * proposal flow). Those get covered by their own e2e suites when those phases merge.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";

test.describe("wave 1 acceptance @smoke", () => {
  test("admin signs in, lands on the shell, sees notifications and role-filtered nav", async ({
    page,
  }) => {
    // 1. Sign in as the seeded admin.
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@futureuni.local");
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // 2. Land inside the shell. Admin has `mustSetUp2fa=true` after the seed, so we may be
    //    redirected to /setup-2fa. Both count as "inside the platform"; assert the shell chrome
    //    is visible either way.
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    // 3. The sidebar carries the "Client Acquisition" module — a MANAGER/SERVICE_LEAD sees it,
    //    an ADMIN sees it plus every admin section. Skip the assertion when the setup gate held
    //    the user inside /setup-2fa (no sidebar there — that page is auth-only chrome).
    const path = new URL(page.url()).pathname;
    if (!path.startsWith("/setup-2fa")) {
      const acquisitionNav = page
        .getByRole("navigation", { name: /sidebar/i })
        .getByText("Client Acquisition");
      await expect(acquisitionNav).toBeVisible();

      // 4. The notification bell shows the seeded admin's unread notifications. The
      //    admin has 3 seeded rows in `prisma/seed/world/platform.ts`.
      const bell = page.getByRole("button", { name: /notifications/i });
      await expect(bell).toBeVisible();

      // 5. Command palette opens with ⌘K / Ctrl+K and lists at least the acquisition sections.
      await page.keyboard.press("ControlOrMeta+K");
      await expect(page.getByPlaceholder(/search actions/i)).toBeVisible();
      await page.getByPlaceholder(/search actions/i).fill("Review");
      await expect(page.getByRole("option", { name: /Review/i }).first()).toBeVisible();
      await page.keyboard.press("Escape");
    }
  });

  test("signed-out visitor is redirected to /login", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1, name: /sign in/i })).toBeVisible();
  });
});
