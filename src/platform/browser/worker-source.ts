/**
 * The standalone capture runner executed inside a remote browser environment — a Vercel Sandbox
 * booted from the ADR-017 snapshot (Playwright + Chromium + axe pre-installed), or the separate
 * `serverless-chromium` project. It runs the same navigation-only capture as `capture-worker.ts`,
 * but as a self-contained ESM script because a remote VM can't import the app's TypeScript.
 *
 * Contract: it reads a normalized request as JSON from the file path in `argv[2]`, and prints one
 * JSON line to stdout: `{ ok, finalUrl, screenshotBase64, screenshotContentType, html?,
 * axeViolations?, consoleErrors?, ogImages?, timings }`. It never types, submits, or logs in.
 *
 * Kept as a string so it ships with the app and is uploaded to the sandbox via `writeFiles`. It is
 * intentionally dependency-light: `playwright` (module name overridable with `PW_MODULE`) and, only
 * when axe is requested, `@axe-core/playwright`.
 */

export const CAPTURE_RUNNER_SOURCE = String.raw`
import { readFileSync } from "node:fs";

const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
};

async function main() {
  const requestPath = process.argv[2];
  const req = JSON.parse(readFileSync(requestPath, "utf8"));
  const { chromium } = await import(process.env.PW_MODULE || "playwright");

  const launchOpts = { headless: true };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) launchOpts.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOpts);
  const vp = VIEWPORTS[req.viewport] || VIEWPORTS.desktop;
  const consoleErrors = [];
  const start = Date.now();
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(String(m.text()).slice(0, 300)); });
    page.on("pageerror", (e) => consoleErrors.push(String(e.message).slice(0, 300)));

    const response = await page.goto(req.url, {
      waitUntil: req.waitFor === "networkidle" ? "networkidle" : "load",
      timeout: req.timeoutMs,
    });

    for (const action of req.actions || []) {
      try {
        if (action.type === "scroll") {
          await page.mouse.wheel(0, action.px);
          await page.waitForTimeout(300);
        } else if (action.type === "click-text" && String(action.text || "").trim() !== "") {
          const target = page.getByRole("link", { name: action.text, exact: false })
            .or(page.getByRole("button", { name: action.text, exact: false })).first();
          await target.click({ timeout: 5000 });
          await page.waitForLoadState("load", { timeout: req.timeoutMs }).catch(() => undefined);
        }
      } catch { /* navigation dead-end, not a failure */ }
    }

    const loadMs = Date.now() - start;
    const finalUrl = page.url();
    const shot = await page.screenshot({ fullPage: Boolean(req.fullPage), type: "png" });

    const out = {
      ok: response ? response.ok() : true,
      finalUrl,
      screenshotBase64: Buffer.from(shot).toString("base64"),
      screenshotContentType: "image/png",
      timings: { loadMs },
    };
    const collect = req.collect || {};
    if (collect.html) out.html = await page.content().catch(() => undefined);
    if (collect.ogImages) {
      out.ogImages = await page.$$eval('meta[property="og:image"], meta[name="og:image"]',
        (ns) => ns.map((n) => n.content).filter((c) => typeof c === "string" && c.length > 0)).catch(() => []);
    }
    if (collect.consoleErrors) out.consoleErrors = consoleErrors;
    if (collect.axe) {
      try {
        const { default: AxeBuilder } = await import("@axe-core/playwright");
        const results = await new AxeBuilder({ page }).analyze();
        out.axeViolations = results.violations.map((v) => ({
          id: v.id, impact: v.impact || "unknown", nodes: v.nodes.length, help: String(v.help).slice(0, 200),
        }));
      } catch { out.axeViolations = []; }
    }
    process.stdout.write(JSON.stringify(out));
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, finalUrl: "", timings: { loadMs: 0 }, blockedReason: "error", error: String(e && e.message ? e.message : e).slice(0, 300) }));
  process.exit(0);
});
`;
