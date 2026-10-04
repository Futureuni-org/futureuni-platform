import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 15 — module shell + search. Signs in as the Web Development service lead, checks the
 * service-line tabs and section nav, then runs a search and watches the live run panel (MOCKS=true
 * so the adapters return data). Runs at 1440 and 375 via the two Playwright projects.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme-local-only-12";

async function signInAsWebLead(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("web.lead@futureuni.local");
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait until login actually completes and navigates away from /login (the session cookie is set).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

test.describe("module shell + search @phase15", () => {
  test("shows line tabs and section nav for a line", async ({ page }) => {
    await signInAsWebLead(page);
    await page.goto("/acquisition/web-development/search");

    await expect(page.getByRole("navigation", { name: /service lines/i })).toBeVisible();
    const sections = page.getByRole("navigation", { name: /line sections/i });
    await expect(sections).toBeVisible();
    // Scope link lookups to the section nav (the word "Search" appears elsewhere too).
    await expect(sections.getByRole("link", { name: /^Search$/ })).toBeVisible();
    await expect(sections.getByRole("link", { name: /^Review$/ })).toBeVisible();
    await expectNoOverflow(page);
  });

  test("the market toggle switches the location fields", async ({ page }) => {
    await signInAsWebLead(page);
    await page.goto("/acquisition/web-development/search");

    await expect(page.getByRole("combobox", { name: /nigerian location/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /international location/i })).toHaveCount(0);

    // Retry the toggle until it registers (the tap can land before hydration attaches the handler,
    // which is slower on the mobile project).
    const both = page.getByRole("radio", { name: "Both" });
    await expect(async () => {
      await both.click();
      await expect(both).toBeChecked({ timeout: 750 });
    }).toPass({ timeout: 10_000 });

    await expect(page.getByRole("combobox", { name: /nigerian location/i })).toBeVisible();
    await expect(page.getByRole("combobox", { name: /international location/i })).toBeVisible();
  });

  test("runs a Nigeria search and shows the live run panel", async ({ page }) => {
    await signInAsWebLead(page);
    await page.goto("/acquisition/web-development/search");

    const location = page.getByRole("combobox", { name: /nigerian location/i });
    const run = page.getByRole("button", { name: /run now/i });
    // Retry the fill until it registers in React state and Run enables (hydration can lag the first
    // input on the mobile project).
    await expect(async () => {
      await location.fill("Lagos");
      await expect(run).toBeEnabled({ timeout: 750 });
    }).toPass({ timeout: 10_000 });
    await run.click();

    await expect(page.getByRole("region", { name: /search run/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/leads created/i)).toBeVisible();
  });

  test("has no serious axe violations on search", async ({ page }) => {
    await signInAsWebLead(page);
    await page.goto("/acquisition/web-development/search");
    // Wait for interactive content rather than network idle (the notifications SSE never idles).
    await expect(page.getByRole("radio", { name: "Nigeria" })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
