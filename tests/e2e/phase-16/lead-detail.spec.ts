import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 16 — lead detail. Opens the first lead in the web-development line and walks its tabs:
 * the header and side rail render, each tab is addressable through `?tab=`, a lead can't be opened
 * under another line, and the page is free of serious/critical axe violations and horizontal
 * overflow. It relies on the seeded leads (`pnpm db:seed`) and fails, rather than skips, if they
 * are missing. The scripted journey that changes data (dismiss a finding, send a one-off email,
 * build and send a proposal, mark won) is the Wave 4 integration spec.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme-local-only-12";
const LEADS_PATH = "/acquisition/web-development/leads";
const TABS = ["evidence", "conversation", "meetings", "proposals", "activity", "notes"] as const;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/setup-2fa|\/(?:$|home|acquisition)/, { timeout: 15_000 });
}

/** The href of the first lead shown in the list (the table on desktop, the cards on mobile). */
async function firstLeadHref(page: Page): Promise<string> {
  await page.goto(LEADS_PATH);
  const link = page.locator(`a[href^="${LEADS_PATH}/c"]`).filter({ visible: true }).first();
  await expect(link, "The seed should contain web-development leads.").toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).not.toBeNull();
  return href ?? "";
}

test.describe("lead detail", () => {
  test("renders the header, side rail and every tab @smoke", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    const href = await firstLeadHref(page);

    const response = await page.goto(href);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Lead sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Contactability" })).toBeVisible();

    for (const tab of TABS) {
      const tabResponse = await page.goto(`${href}?tab=${tab}`);
      expect(tabResponse?.status(), `tab ${tab}`).toBeLessThan(400);
      await expect(
        page.getByRole("navigation", { name: "Lead sections" }).locator('[aria-current="page"]'),
      ).toHaveText(new RegExp(tab, "i"));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `overflow on ${tab}`).toBe(false);
    }
  });

  test("a lead can't be opened under another service line", async ({ page }) => {
    await signIn(page, "manager@futureuni.local");
    const href = await firstLeadHref(page);
    const leadId = href.split("/").pop() ?? "";

    // The manager works every line, so this isolates the line check: the lead isn't a video lead.
    await page.goto(`/acquisition/video-editing/leads/${leadId}`);
    // The route streams (it has a loading state), so the response has already started with 200
    // when the page finds the lead isn't in this line. What matters is what the person gets: the
    // not-found page, and nothing of the lead.
    await expect(page.getByRole("heading", { name: /couldn't find that page/i })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Lead sections" })).toHaveCount(0);
  });

  test("the overview, evidence and proposals tabs have no serious accessibility violations", async ({
    page,
  }) => {
    await signIn(page, "web.lead@futureuni.local");
    const href = await firstLeadHref(page);

    for (const path of [href, `${href}?tab=evidence`, `${href}?tab=proposals`]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious, `${path}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([]);
    }
  });
});
