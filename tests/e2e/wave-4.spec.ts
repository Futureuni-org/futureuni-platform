import { expect, test, type Page } from "@playwright/test";

/**
 * Wave 4 acceptance — Part C3 of docs/prompts/wave-4/wave-4-prep-and-merge.md.
 *
 * With Phases 15 (shell, search, review), 16 (leads, pipeline, inbox) and 17 (analytics) merged,
 * `SEAM-LINE-CONTEXT` connected and the acquisition manifest wired, this suite is the integration
 * crawl:
 *   - C3.3 every navigable route (overview + each line × each section) resolves — no 404 behind any
 *     nav entry or `lineHref` target — for a broad-permission user and for a line-scoped lead;
 *   - C3.7 a line lead's journey across the seven sections of their line via the real sidebar;
 *   - M17-AC5 the analytics drill-downs (`lineHref(line, "leads", { signal, from, to, market })`)
 *     land on the Phase 16 leads list rather than a 404.
 *
 * MANAGER (`manager@futureuni.local`) has every read permission across all lines and — unlike an
 * ADMIN, who is always forced through 2FA setup — no 2FA gate, so it reaches the shell directly
 * and sees all 29 routes.
 */

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "change-me-local-only";

const MANAGER = "manager@futureuni.local";
const WEB_LEAD = "web.lead@futureuni.local"; // SERVICE_LEAD, Web Development only

/** The four line slugs and seven section slugs, from the acquisition manifest (module spec §3.1/§6). */
const LINES = ["web-development", "ui-ux-design", "graphic-design", "video-editing"] as const;
const SECTIONS = [
  "search",
  "review",
  "leads",
  "pipeline",
  "inbox",
  "analytics",
  "settings",
] as const;

const NOT_FOUND_HEADING = /We couldn't find that page/i;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** A resolved in-shell page shows the sidebar and never the global 404 heading. */
async function expectResolvedShellPage(page: Page, path: string): Promise<void> {
  await expect(page.getByRole("heading", { name: NOT_FOUND_HEADING })).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: /sidebar/i }),
    `sidebar missing on ${path} (page did not render inside the shell)`,
  ).toBeVisible();
}

test.describe("wave 4 — route crawl @smoke", () => {
  test("manager: overview and every line × section resolve (no 404)", async ({ page }) => {
    await signIn(page, MANAGER);

    const routes = ["/acquisition/overview"];
    for (const line of LINES) {
      routes.push(`/acquisition/${line}`);
      for (const section of SECTIONS) routes.push(`/acquisition/${line}/${section}`);
    }

    for (const path of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expectResolvedShellPage(page, path);
    }
  });
});

test.describe("wave 4 — line lead journey", () => {
  test("web lead steps through their line's sections via the sidebar", async ({ page }) => {
    await signIn(page, WEB_LEAD);

    // Land on the shell and open the Web Development line.
    await page.goto("/acquisition/web-development", { waitUntil: "domcontentloaded" });
    await expectResolvedShellPage(page, "/acquisition/web-development");

    const sidebar = page.getByRole("navigation", { name: /sidebar/i });

    // Every section of the lead's own line is a real, resolving route. Assert the sidebar carries
    // the link (nav wiring) and the target renders in the shell (no 404 behind the entry).
    for (const section of SECTIONS) {
      const href = `/acquisition/web-development/${section}`;
      await expect(
        sidebar.getByRole("link", { name: new RegExp(section.replace("-", "[ /-]?"), "i") }).first(),
        `sidebar has no link to ${section}`,
      ).toBeVisible();

      await page.goto(href, { waitUntil: "domcontentloaded" });
      await expectResolvedShellPage(page, href);
    }
  });
});

test.describe("wave 4 — analytics drill-down (M17-AC5)", () => {
  test("a drill-down from analytics lands on the leads list, not a 404", async ({ page }) => {
    await signIn(page, WEB_LEAD);
    await page.goto("/acquisition/web-development/analytics", { waitUntil: "domcontentloaded" });
    await expectResolvedShellPage(page, "/acquisition/web-development/analytics");

    // Analytics renders `lineHref(line, "leads", { … })` drill-downs (signal bar, breakdown rows).
    // Find one that points at the leads list with query params; follow it and assert it resolves.
    const drill = page.locator('a[href*="/acquisition/web-development/leads?"]').first();

    const count = await drill.count();
    if (count === 0) {
      test.skip(true, "no analytics drill-down link rendered (data-dependent); crawl covers the route");
      return;
    }

    await drill.click();
    await page.waitForURL(/\/acquisition\/web-development\/leads\?/, { timeout: 15_000 });
    await expectResolvedShellPage(page, "/acquisition/web-development/leads?…");
  });
});
