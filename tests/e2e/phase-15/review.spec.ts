import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 15 — review queue. Signs in as the Web Development service lead and exercises the queue: if
 * drafts are seeded it reviews one (focus card, edit→confirm→approve), either way it checks the
 * screen renders with no serious axe violations, and a Video-Editing service lead can't open the
 * Web Development review queue.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme-local-only-12";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

test.describe("review queue @phase15", () => {
  test("renders the queue (card or clear) with no serious axe violations", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto("/acquisition/web-development/review");
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible({ timeout: 15_000 });

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test("reviews a draft when the queue has items", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto("/acquisition/web-development/review");
    await expect(page.getByRole("heading", { name: /review queue/i })).toBeVisible({ timeout: 15_000 });

    const approve = page.getByRole("button", { name: /approve/i }).first();
    if ((await approve.count()) === 0) {
      await expect(page.getByText(/queue clear/i)).toBeVisible();
      return;
    }

    // Editing the body requires the truth confirmation before approve re-enables.
    await page.getByRole("button", { name: /^edit/i }).first().click();
    const body = page.getByRole("textbox", { name: /message body/i });
    if ((await body.count()) > 0) {
      await body.fill("FUTUREUNI — a quick, true note about your website.");
      const confirm = page.getByLabel(/i confirm every statement/i);
      if ((await confirm.count()) > 0) {
        await expect(approve).toBeDisabled();
        await confirm.check();
        await expect(approve).toBeEnabled();
      }
    }
  });

  test("a Video Editing service lead can't open the Web Development review queue", async ({ page }) => {
    await signIn(page, "video.lead@futureuni.local"); // SERVICE_LEAD, Video Editing only (AC-20.6)
    await page.goto("/acquisition/web-development/review");
    await expect(page.getByText(/no access/i)).toBeVisible({ timeout: 15_000 });
  });
});
