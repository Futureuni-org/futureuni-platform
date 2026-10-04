import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 16 — inbox. Signs in as the seeded web-development service lead and checks the screen: the
 * thread list and filters render, a thread opens through `?thread=`, the reply can't be sent until
 * it is confirmed, an unsubscribe has no composer at all, reclassifying to "unsubscribe" explains
 * the consequence and can be cancelled, Enter still works on ordinary controls, and there are no
 * serious accessibility violations or horizontal overflow. The unmatched tab is checked as the
 * seeded manager: an unmatched reply has no service line yet, so the inbox service shows it only to
 * people whose access isn't per line. It relies on the seeded inbox (`pnpm db:seed`: "interested"
 * email threads, an unsubscribe and one unmatched reply) and fails, rather than skips, if that data
 * is missing. Sending a reply and linking an unmatched reply change data, so they belong to the
 * Wave 4 integration spec.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";
const INBOX_PATH = "/acquisition/web-development/inbox";
const SERVICE_LEAD = "web.lead@futureuni.local";
const MANAGER = "manager@futureuni.local";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/setup-2fa|\/(?:$|home|acquisition)/, { timeout: 15_000 });
}

/** Opens the first thread whose latest reply has this class. */
async function openThread(page: Page, replyClass: string): Promise<void> {
  await page.goto(`${INBOX_PATH}?class=${replyClass}`);
  const first = page.getByRole("list", { name: "Threads" }).getByRole("link").first();
  await expect(first, `The seed should contain a thread classed ${replyClass}.`).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/thread=/);
}

test.describe("inbox", () => {
  test("renders the thread list and its filters @smoke", async ({ page }) => {
    await signIn(page, SERVICE_LEAD);
    const response = await page.goto(INBOX_PATH);
    expect(response?.status()).toBeLessThan(400);

    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Inbox views" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Threads" }).getByRole("link").first(),
    ).toBeVisible();

    await page.getByLabel("Class", { exact: true }).selectOption("INTERESTED");
    await expect(page).toHaveURL(/class=INTERESTED/);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test("a reply can't be sent until it is confirmed", async ({ page }) => {
    await signIn(page, SERVICE_LEAD);
    await openThread(page, "INTERESTED");

    const composer = page.getByRole("region", { name: "Reply" });
    await composer.getByRole("textbox", { name: /message/i }).fill("Thanks for your reply.");
    const send = composer.getByRole("button", { name: "Send reply" });
    await expect(send).toBeDisabled();
    await composer.getByRole("checkbox", { name: /every claim in it is accurate/i }).check();
    await expect(send).toBeEnabled();
  });

  test("an unsubscribe is never answered: the thread has no composer", async ({ page }) => {
    await signIn(page, SERVICE_LEAD);
    await openThread(page, "UNSUBSCRIBE");

    await expect(page.getByRole("list", { name: "Conversation" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Reply" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send reply" })).toHaveCount(0);
    await expect(page.getByText(/no reply can be sent|can't be messaged/)).toBeVisible();
  });

  test("reclassifying to unsubscribe explains the consequence and can be cancelled", async ({
    page,
  }) => {
    await signIn(page, SERVICE_LEAD);
    await openThread(page, "INTERESTED");

    const classSelect = page.getByRole("combobox", { name: "Reply class" });
    await expect(classSelect).toHaveValue("INTERESTED");

    await classSelect.selectOption("UNSUBSCRIBE");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "This will suppress this contact and stop all outreach to the company",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(classSelect).toHaveValue("INTERESTED");
  });

  test("Enter activates the focused control, and J moves through the thread list", async ({
    page,
  }) => {
    await signIn(page, SERVICE_LEAD);
    await openThread(page, "INTERESTED");

    // The list's shortcuts must not swallow Enter on other controls.
    await page.getByRole("button", { name: "Snooze" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Snooze this thread");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    // J puts real focus on a row's link, so Enter opens it like any link. From the list itself:
    // at phone width an open thread takes the list's place, so there is no row to move to.
    await page.goto(INBOX_PATH);
    const threads = page.getByRole("list", { name: "Threads" });
    await expect(threads.getByRole("link").first()).toBeVisible();
    // Click the heading first so the page is interactive (the shortcut listener is attached)
    // before the key is pressed; a key sent mid-hydration is dropped.
    await page.getByRole("heading", { name: "Inbox", level: 1 }).click();
    await page.keyboard.press("j");
    await expect(threads.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/thread=/);
  });

  test("the unmatched tab lists replies that need linking", async ({ page }) => {
    await signIn(page, MANAGER);
    await page.goto(`${INBOX_PATH}?tab=unmatched`);
    await expect(
      page.getByRole("navigation", { name: "Inbox views" }).locator('[aria-current="page"]'),
    ).toContainText("Unmatched");
    await expect(page.getByRole("button", { name: "Link to a lead" }).first()).toBeVisible();
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await signIn(page, SERVICE_LEAD);
    await openThread(page, "INTERESTED");
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });
});
