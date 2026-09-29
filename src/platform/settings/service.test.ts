import { beforeEach, describe, expect, it } from "vitest";

import { getSetting, listSettings, _resetSettingsRegistry } from "./service";

beforeEach(() => {
  _resetSettingsRegistry();
});

describe("settings service", () => {
  it("returns the registered default when nothing is stored", async () => {
    const value = await getSetting<string>("platform.timezone");
    expect(value).toBe("Africa/Lagos");
  });

  it("lists platform-scope settings", async () => {
    const rows = await listSettings({ scope: "PLATFORM" });
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("platform.postalAddress");
    expect(keys).toContain("ai.modelTiers");
    for (const row of rows) expect(row.scope).toBe("PLATFORM");
  });

  it("throws NOT_FOUND for an unknown key", async () => {
    await expect(getSetting("does.not.exist")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
