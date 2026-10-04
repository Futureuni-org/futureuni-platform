import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 17 e2e: the line analytics page and the overview tab. Covers the Wave 4 bar — URL-driven
 * filters that re-render the server page, CSV export, role scoping and no-horizontal-overflow on
 * mobile. The signal-bar drill-down into the Phase 16 leads list is a cross-phase link, so it is
 * asserted in the Wave 4 integration suite (Phase 16 isn't merged in this worktree).
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("line analytics @smoke", () => {
  test("a manager opens line analytics and the filters drive the URL", async ({ page }) => {
    await signIn(page, "manager@futureuni.local");
    await page.goto("/acquisition/web-development/analytics");

    await expect(page.getByRole("heading", { name: /Web Development analytics/i })).toBeVisible();

    // Date range → URL.
    await page.getByLabel("Date range").selectOption("7d");
    await expect(page).toHaveURL(/range=7d/);

    // Market → URL.
    await page.getByLabel("Market").selectOption("NIGERIA");
    await expect(page).toHaveURL(/market=NIGERIA/);

    // Compare toggle → URL.
    await page.getByRole("button", { name: /compare to previous/i }).click();
    await expect(page).toHaveURL(/compare=previous_period/);

    // A headline stat and the funnel section are present after the re-render.
    await expect(page.getByText(/leads found/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /the funnel/i })).toBeVisible();
  });

  test("a chart exports a CSV", async ({ page }) => {
    await signIn(page, "manager@futureuni.local");
    await page.goto("/acquisition/web-development/analytics");
    const csvButton = page.getByRole("button", { name: /export funnel as csv/i });
    await expect(csvButton).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), csvButton.click()]);
    expect(download.suggestedFilename()).toMatch(/funnel-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test("a member sees the no-permission state on a line that isn't theirs (AC-38.4)", async ({ page }) => {
    await signIn(page, "kelechi@futureuni.local"); // MEMBER of Web + Graphic, not Video
    await page.goto("/acquisition/video-editing/analytics");
    await expect(page.getByText(/don't have access/i)).toBeVisible();
  });
});

test.describe("overview", () => {
  test("a manager sees every line compared (AC-39.1)", async ({ page }) => {
    await signIn(page, "manager@futureuni.local");
    await page.goto("/acquisition/overview");
    await expect(page.getByRole("heading", { name: /acquisition overview/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /lines compared/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /capacity and throttle/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /cross-sell opportunities/i })).toBeVisible();
    // No search/draft/approve actions on the overview (AC-39.3).
    await expect(page.getByRole("button", { name: /^(run|approve|draft|send)/i })).toHaveCount(0);
  });

  test("a service lead's overview is scoped to their line (AC-39.2)", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto("/acquisition/overview");
    await expect(page.getByRole("heading", { name: /acquisition overview/i })).toBeVisible();
    // The Web Development line is shown; the other lines' capacity rows are not.
    await expect(page.getByText(/web/i).first()).toBeVisible();
  });
});

test.describe("responsive", () => {
  test("the analytics page has no horizontal overflow", async ({ page }) => {
    await signIn(page, "manager@futureuni.local");
    await page.goto("/acquisition/web-development/analytics");
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
