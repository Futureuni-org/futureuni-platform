/**
 * Env-key resolution under mock mode (ADR-005). A key sitting in the environment must not make a
 * provider reachable while that provider is still mocked.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ live: [] as string[] }));

vi.mock("@/env", () => ({
  env: { RESEND_API_KEY: "re_live_key", ANTHROPIC_API_KEY: "sk-ant-key" },
  isProviderLive: (id: string) => state.live.includes(id),
  PROVIDER_ENV_KEY: {
    anthropic: "ANTHROPIC_API_KEY",
    "google-places": "GOOGLE_PLACES_API_KEY",
    pagespeed: "PAGESPEED_API_KEY",
    "youtube-data": "YOUTUBE_API_KEY",
    serpapi: "SERPAPI_API_KEY",
    hunter: "HUNTER_API_KEY",
    "companies-house": "COMPANIES_HOUSE_API_KEY",
    resend: "RESEND_API_KEY",
    "cal-com": "CALCOM_API_KEY",
  },
}));

async function load(live: string[]) {
  state.live = live;
  vi.resetModules();
  return import("./providers");
}

afterEach(() => {
  vi.resetModules();
});

describe("providerEnvKey", () => {
  it("names the variable for a known provider", async () => {
    const { providerEnvKey } = await load([]);
    expect(providerEnvKey("resend")).toBe("RESEND_API_KEY");
  });

  it("returns null for providers with no env fallback", async () => {
    const { providerEnvKey } = await load([]);
    expect(providerEnvKey("adzuna")).toBeNull();
    expect(providerEnvKey("browser")).toBeNull();
    expect(providerEnvKey("outreach-mailbox:abc")).toBeNull();
  });

  it("does not resolve inherited object properties as providers", async () => {
    const { providerEnvKey } = await load([]);
    expect(providerEnvKey("constructor" as never)).toBeNull();
    expect(providerEnvKey("toString" as never)).toBeNull();
  });
});

describe("readProviderEnvKey", () => {
  it("ignores a key in the environment while the provider is mocked", async () => {
    const { readProviderEnvKey } = await load([]);
    expect(readProviderEnvKey("resend")).toBeNull();
  });

  it("returns the key once that provider is live", async () => {
    const { readProviderEnvKey } = await load(["resend"]);
    expect(readProviderEnvKey("resend")).toBe("re_live_key");
  });

  it("keeps other providers mocked when only one is live", async () => {
    const { readProviderEnvKey } = await load(["resend"]);
    expect(readProviderEnvKey("anthropic")).toBeNull();
  });
});
