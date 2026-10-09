/**
 * Env-key resolution under mock mode (ADR-005). A key sitting in the environment must not make a
 * provider reachable while that provider is still mocked.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ live: [] as string[] }));

vi.mock("@/env", () => ({
  // Deliberately not shaped like real keys: the pre-commit secrets guard scans the diff.
  env: { RESEND_API_KEY: "resend-test-key", ANTHROPIC_API_KEY: "anthropic-test-key" },
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

/**
 * This reader is deliberately ungated — mock mode is enforced once, by `resolveProviderKey`
 * (covered in service.test.ts), so that `resolveWebhookSecret` can read the same value without it.
 */
describe("readProviderEnvKey", () => {
  it("returns the configured value for a provider that has a key variable", async () => {
    const { readProviderEnvKey } = await load([]);
    expect(readProviderEnvKey("resend")).toBe("resend-test-key");
    expect(readProviderEnvKey("anthropic")).toBe("anthropic-test-key");
  });

  it("returns null for a provider with no key variable", async () => {
    const { readProviderEnvKey } = await load([]);
    expect(readProviderEnvKey("adzuna")).toBeNull();
    expect(readProviderEnvKey("outreach-mailbox:abc")).toBeNull();
  });

  it("treats a blank or unset variable as absent", async () => {
    const { readProviderEnvKey } = await load([]);
    // HUNTER_API_KEY is not in the mocked env at all.
    expect(readProviderEnvKey("hunter")).toBeNull();
  });
});
