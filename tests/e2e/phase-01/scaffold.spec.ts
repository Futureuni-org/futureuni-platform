import { expect, test } from "@playwright/test";

/**
 * Phase 1 kept a smoke test that asserted the placeholder home rendered anonymously. Phase 3's
 * proxy now redirects anonymous visitors on any `(platform)` route to `/login`, so this suite
 * asserts the redirect and the sign-in page shape instead (CR-01-01: Phase 3/4 grant to update).
 * Phase 4 will refresh the login shell; the redirect contract stays the same.
 */

test.describe("scaffold home redirect", () => {
  test("anonymous visitor is redirected to /login", { tag: "@smoke" }, async ({ page }) => {
    const response = await page.goto("/");
    expect(page.url()).toMatch(/\/login($|\?)/);
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: /sign in/i })).toBeVisible();
  });

  test("has no horizontal overflow on the login page", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});
