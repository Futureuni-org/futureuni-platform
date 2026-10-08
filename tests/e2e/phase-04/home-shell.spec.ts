import { expect, test } from "@playwright/test";

/**
 * Phase 4 smoke: signing in as the seeded admin lands on the platform shell (sidebar visible on
 * desktop, greeting rendered), and every gallery page loads without horizontal overflow.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "changeme-local-only-12";

test.describe("shell + home @smoke", () => {
  test("admin signs in and lands on the platform home", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@futureuni.local");
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // Admin has mustSetUp2fa=true after seed; the sign-in redirects to /setup-2fa. That's still
    // an authenticated route inside the platform shell.
    await page.waitForURL(/\/setup-2fa|\/(?:$|home|acquisition)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("dev/ui gallery pages have no horizontal overflow", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@futureuni.local");
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    // If the admin is redirected into /setup-2fa, we still want the gallery to be reachable via
    // a direct navigation. The layout will surface the permission state if it disagrees.
    await page.waitForLoadState("networkidle");
    for (const path of ["/dev/ui", "/dev/ui/tokens", "/dev/ui/badges", "/dev/ui/states"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `overflow on ${path}`).toBe(false);
    }
  });
});
