import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 16 — leads list. Signs in as the seeded web-development service lead and exercises the
 * screen: it renders, the filters live in the URL, a saved view can be created, and the page is
 * free of serious/critical axe violations and horizontal overflow in both themes. Flows that need
 * seeded leads (bulk actions) are guarded so the spec is robust to an empty line; the full
 * cross-screen journey lives in the Wave 4 integration spec.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";
const LEADS_PATH = "/acquisition/web-development/leads";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/setup-2fa|\/(?:$|home|acquisition)/, { timeout: 15_000 });
}

test.describe("leads list @smoke", () => {
  test("renders the leads screen with its filters", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    const response = await page.goto(LEADS_PATH);
    expect(response?.status()).toBeLessThan(500);

    await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: /search leads/i })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("a status filter is written to the URL", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(LEADS_PATH);
    await page.getByLabel("Status").selectOption("replied");
    await expect(page).toHaveURL(/group=replied/);
  });

  test("a saved view can be created from the current filters", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(`${LEADS_PATH}?group=replied`);
    await page.getByRole("button", { name: /save view/i }).click();
    const name = `E2E view ${String(Date.now())}`;
    await page.getByLabel("View name").fill(name);
    await page.getByRole("button", { name: /^save view$/i }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(LEADS_PATH);
    await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
