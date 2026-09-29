import { expect, test } from "@playwright/test";

/**
 * Phase 3 sign-in smoke test.
 *
 *   - /login renders the on-brand form.
 *   - A wrong password shows a generic error and does not enumerate the account.
 *   - Visiting a protected route while signed out redirects with a `next` param.
 */

test.describe("sign-in @smoke", () => {
  test("wrong credentials show a generic message", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@futureuni.local");
    await page.getByLabel("Password").fill("wrong-password-1234");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Both our error banner and Next's route announcer expose role="alert"; scope to the
    // banner by its text so the assertion is unambiguous.
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    // Still on the login page — no redirect took place.
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects unauthenticated users on protected routes", async ({ page }) => {
    const response = await page.goto("/settings");
    expect(page.url()).toMatch(/\/login\?next=/);
    expect(response?.status()).toBeLessThan(400);
  });
});
