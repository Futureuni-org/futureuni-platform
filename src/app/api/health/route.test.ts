import { describe, expect, it } from "vitest";

import { GET, type HealthResponse } from "./route";

describe("GET /api/health", () => {
  it("reports status, version, commit and the mock flag, uncached", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = (await response.json()) as HealthResponse;
    expect(Object.keys(body).sort()).toEqual(["commit", "mocks", "status", "version"]);
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.mocks).toBe(true);
  });

  it("never includes a secret or connection string", async () => {
    const text = await GET().text();
    for (const key of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "CRON_SECRET",
      "CREDENTIALS_ENCRYPTION_KEY",
    ]) {
      const value = process.env[key];
      expect(value).toBeDefined();
      expect(text).not.toContain(value);
    }
    expect(text).not.toContain("postgresql://");
  });
});
