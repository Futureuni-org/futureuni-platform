import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/platform/db";
import { _resetRobotsCache, configureSsrf, setRobotsFetcher } from "@/platform/http";

import { capture } from "./capture";
import { UnsafeActionError } from "./safety";

afterEach(() => {
  configureSsrf();
  _resetRobotsCache();
});

function allowRobots(host: string): void {
  configureSsrf({ trustHostnames: [host] });
  setRobotsFetcher(() => Promise.resolve({ ok: true, status: 200, body: "User-agent: *\nDisallow:" }));
}

describe("capture (mock runtime, BROWSER_RUNTIME=mock)", () => {
  it("captures a page, collects data, and stores a private WebP screenshot", async () => {
    allowRobots("capture-ok.example");
    const result = await capture({
      url: "https://capture-ok.example/",
      viewport: "mobile",
      collect: { html: true, ogImages: true, axe: true },
    });

    expect(result.ok).toBe(true);
    expect(result.finalUrl).toBe("https://capture-ok.example/");
    expect(result.html).toContain("<title>");
    expect(result.ogImages?.length ?? 0).toBeGreaterThan(0);
    expect(result.screenshotKey).toBeDefined();

    const file = await db.fileObject.findUnique({
      where: { key: result.screenshotKey ?? "" },
      select: { purpose: true, access: true, contentType: true, retentionUntil: true },
    });
    expect(file).not.toBeNull();
    expect(file?.purpose).toBe("AUDIT_SCREENSHOT");
    expect(file?.access).toBe("PRIVATE");
    expect(file?.contentType).toBe("image/webp");
    expect(file?.retentionUntil).not.toBeNull();
  }, 20_000);

  it("returns a blocked result (no screenshot) for an SSRF-guarded address", async () => {
    const result = await capture({ url: "http://169.254.169.254/latest/meta-data/", viewport: "desktop" });
    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("ssrf");
    expect(result.screenshotKey).toBeUndefined();
  });

  it("throws on a non-navigation action (caller bug)", async () => {
    allowRobots("capture-unsafe.example");
    await expect(
      capture({
        url: "https://capture-unsafe.example/",
        viewport: "desktop",
        actions: [{ type: "click-text", text: "" }],
      }),
    ).rejects.toThrow(UnsafeActionError);
  });
});
