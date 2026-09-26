import { expect, test } from "@playwright/test";

// Phase 1 smoke test: the placeholder home renders with the brand and the theme switch works.
// Phase 4 replaces the placeholder home, and with it this spec.

test.describe("scaffold home", () => {
  test("renders the placeholder and switches to dark mode", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("FUTUREUNI", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Scaffold ready" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The saved choice is applied before paint on the next load.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("has no horizontal overflow", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("with the OS in dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("follows the OS preference when nothing is saved", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
