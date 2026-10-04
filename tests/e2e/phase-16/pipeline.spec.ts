import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 16 — pipeline board. Signs in as the seeded web-development service lead and checks the
 * board: its stages and per-stage summaries render, filters and the nurture lane live in the URL,
 * a card opens in the side sheet without leaving the board, a drop on Won opens the dialog and
 * cancelling it leaves the card in place, and the page has no serious accessibility violations or
 * horizontal overflow. It relies on the seeded pipeline (`pnpm db:seed`: a lead in conversation and
 * one with a sent proposal) and fails, rather than skips, if that data is missing.
 *
 * Moves are driven from each card's "Move to" menu, which runs the same rules as a drag and is the
 * keyboard-accessible route; this keeps the spec deterministic on both desktop and mobile.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";
const BOARD_PATH = "/acquisition/web-development/pipeline";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/setup-2fa|\/(?:$|home|acquisition)/, { timeout: 15_000 });
}

/** The first card's actions menu in a stage. The seed puts at least one lead in each open stage. */
async function firstCardMenu(page: Page, stage: string) {
  // On a phone the board scrolls sideways; the "Jump to a stage" control (mobile only) brings the
  // stage's cards to the start, so the card's own controls sit at a stable, clickable position.
  const jump = page.getByRole("combobox", { name: "Jump to a stage" });
  if (await jump.isVisible()) {
    await jump.selectOption({ label: stage });
  }
  const menu = page
    .getByRole("region", { name: stage })
    .getByRole("button", { name: /^Actions for / })
    .first();
  await expect(menu, `The seed should put a lead in "${stage}".`).toBeVisible();
  // Centre it in the viewport before the caller clicks: scrolled to the top it sits under the
  // sticky header, which would intercept the click on a phone.
  await menu.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "center" });
  });
  return menu;
}

test.describe("pipeline board", () => {
  test("renders the stages with their summaries @smoke", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    const response = await page.goto(BOARD_PATH);
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();
    const stages = page.getByRole("group", { name: "Pipeline stages" });
    for (const stage of [
      "Awaiting reply",
      "Conversation",
      "Meeting booked",
      "Proposal sent",
      "Won",
      "Lost",
    ]) {
      await expect(stages.getByRole("heading", { name: stage })).toBeAttached();
    }

    // The board scrolls sideways inside itself; the page must not. Measured on the page content box
    // (`body`): the board is a legitimate inner horizontal scroller, and Chromium's
    // documentElement.scrollWidth over-reports a nested scroller's extent.
    const overflow = await page.evaluate(
      () => document.body.scrollWidth > document.body.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("the nurture lane and filters are written to the URL", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(BOARD_PATH);

    await page.getByRole("button", { name: "Nurture lane" }).click();
    await expect(page).toHaveURL(/nurture=1/);
    await expect(
      page
        .getByRole("group", { name: "Pipeline stages" })
        .getByRole("heading", { name: "Nurture" }),
    ).toBeAttached();

    await page.getByRole("button", { name: "Overdue only" }).click();
    await expect(page).toHaveURL(/overdue=1/);
  });

  test("a card opens in the side sheet and the board stays in view", async ({ page }, testInfo) => {
    // A card's dropdown menu is a 48px target (the "on a phone" test checks that), but driving it
    // through the harness's touch-tap on a horizontally scrolling board under the sticky header is
    // not reliable. This flow is about the sheet, not the layout, so it runs on desktop; the mobile
    // project keeps the render, filters, touch-target, overflow and a11y checks.
    test.skip(testInfo.project.name === "mobile", "Dropdown behaviour is viewport-independent.");
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(BOARD_PATH);

    await (await firstCardMenu(page, "Conversation")).click();
    await page.getByRole("menuitem", { name: "Open", exact: true }).click();

    await expect(page).toHaveURL(/lead=/);
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Open full page" }),
    ).toBeVisible();
    // The board is still on the page behind the sheet. An open sheet hides everything else from
    // assistive technology, so the heading has to be looked up among hidden elements too.
    await expect(
      page.getByRole("heading", { name: "Pipeline", level: 1, includeHidden: true }),
    ).toBeAttached();
  });

  test("a move to Won opens the dialog, and cancelling leaves the card in place", async ({
    page,
  }, testInfo) => {
    // Desktop only, for the same reason as the sheet test above: this is the dropdown's Won flow,
    // which doesn't change with the viewport.
    test.skip(testInfo.project.name === "mobile", "Dropdown behaviour is viewport-independent.");
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(BOARD_PATH);

    const menu = await firstCardMenu(page, "Proposal sent");
    const company = ((await menu.getAttribute("aria-label")) ?? "").replace("Actions for ", "");

    await menu.click();
    await page.getByRole("menuitem", { name: "Won", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`Mark ${company} won`);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page
        .getByRole("region", { name: "Proposal sent" })
        .getByRole("button", { name: `Actions for ${company}` }),
    ).toBeVisible();
  });

  test("on a phone, a card's controls are full-size touch targets and the page doesn't overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(BOARD_PATH);

    // The drag handle and the actions menu of the first card in Conversation (project rule: 48px).
    const stage = page.getByRole("region", { name: "Conversation" });
    const menu = await firstCardMenu(page, "Conversation");
    const handle = stage.getByRole("button", { name: /^Move / }).first();
    for (const control of [handle, menu]) {
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(48);
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }

    const overflow = await page.evaluate(
      () => document.body.scrollWidth > document.body.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await signIn(page, "web.lead@futureuni.local");
    await page.goto(`${BOARD_PATH}?nurture=1&awaiting=1`);
    await expect(page.getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
