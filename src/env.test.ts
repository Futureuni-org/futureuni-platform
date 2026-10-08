import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENV_KEYS,
  type EnvSource,
  EnvValidationError,
  parseEnv,
  PRODUCTION_PROVIDER_KEYS,
  VERCEL_SYSTEM_VARIABLES,
} from "@/env";

import { TEST_ENV } from "../tests/setup/test-env";

const valid: EnvSource = { ...TEST_ENV, NODE_ENV: "development" };

function messageOf(source: EnvSource): string {
  try {
    parseEnv(source);
  } catch (error) {
    expect(error).toBeInstanceOf(EnvValidationError);
    return (error as EnvValidationError).message;
  }
  throw new Error("expected parseEnv to fail");
}

describe("parseEnv", () => {
  it("accepts a complete local environment and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.MOCKS).toBe(true);
    expect(env.PORT).toBe(3000);
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.OUTREACH_SENDER).toBe("mock");
  });

  it("fails naming DATABASE_URL when it is missing", () => {
    expect(messageOf({ ...valid, DATABASE_URL: undefined })).toContain("DATABASE_URL: is required");
  });

  it("treats a blank value as missing", () => {
    expect(messageOf({ ...valid, DIRECT_URL: "  " })).toContain("DIRECT_URL: is required");
  });

  it("lists every bad variable at once, without printing values", () => {
    const message = messageOf({
      ...valid,
      DATABASE_URL: "mysql://secret-host/db",
      CRON_SECRET: "short-secret-value",
    });
    expect(message).toContain(
      "DATABASE_URL: must be a postgres:// or postgresql:// connection string",
    );
    expect(message).toContain("CRON_SECRET: must be at least 32 characters");
    expect(message).not.toContain("secret-host");
    expect(message).not.toContain("short-secret-value");
  });

  it("rejects the .env.example placeholders", () => {
    expect(messageOf({ ...valid, BETTER_AUTH_SECRET: "REPLACE_WITH_RANDOM_SECRET" })).toContain(
      "BETTER_AUTH_SECRET: still has the .env.example placeholder",
    );
  });

  it("requires a 32-byte base64 encryption key", () => {
    const sixteenBytes = Buffer.alloc(16, 1).toString("base64");
    expect(messageOf({ ...valid, CREDENTIALS_ENCRYPTION_KEY: sixteenBytes })).toContain(
      "CREDENTIALS_ENCRYPTION_KEY: must be 32 bytes encoded as base64",
    );
  });

  // A Vercel production deployment (always on the Blob storage driver there).
  const vercelProduction = {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "production",
    STORAGE_DRIVER: "vercel-blob",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_token",
  };

  it("keeps provider keys optional while MOCKS=true, even in production", () => {
    expect(() => parseEnv({ ...valid, ...vercelProduction, MOCKS: "true" })).not.toThrow();
  });

  it("requires every provider key in the production deployment when MOCKS=false", () => {
    const message = messageOf({ ...valid, ...vercelProduction, MOCKS: "false" });
    for (const key of PRODUCTION_PROVIDER_KEYS) {
      expect(message).toContain(
        `${key}: is required in production (VERCEL_ENV=production) when MOCKS=false`,
      );
    }
  });

  it("keeps provider keys optional in a local production build when MOCKS=false", () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: "production", MOCKS: "false" })).not.toThrow();
  });

  it("requires the Blob token whenever the Blob driver is selected", () => {
    const message = messageOf({ ...valid, ...vercelProduction, BLOB_READ_WRITE_TOKEN: "" });
    expect(message).toContain(
      'BLOB_READ_WRITE_TOKEN: is required when STORAGE_DRIVER="vercel-blob"',
    );
  });

  it("rejects the local storage driver on Vercel", () => {
    expect(messageOf({ ...valid, VERCEL: "1", VERCEL_ENV: "preview" })).toContain(
      'STORAGE_DRIVER: must be "vercel-blob" on Vercel',
    );
  });

  it("requires the driver's credentials for the selected driver in production", () => {
    const providerKeys = Object.fromEntries(
      PRODUCTION_PROVIDER_KEYS.map((key) => [key, "test-provider-key"]),
    );
    const message = messageOf({
      ...valid,
      ...providerKeys,
      ...vercelProduction,
      MOCKS: "false",
      OUTREACH_SENDER: "gmail-api",
      BROWSER_RUNTIME: "vercel-sandbox",
    });
    expect(message).toContain("GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: is required");
    expect(message).toContain("VERCEL_SANDBOX_SNAPSHOT_ID: is required");
  });

  it("requires the Google OAuth client when Google sign-in is on", () => {
    expect(messageOf({ ...valid, AUTH_GOOGLE_ENABLED: "true" })).toContain(
      "GOOGLE_OAUTH_CLIENT_ID: is required when AUTH_GOOGLE_ENABLED=true",
    );
  });

  it("rejects a MOCKS value that isn't a boolean", () => {
    expect(messageOf({ ...valid, MOCKS: "maybe" })).toContain("MOCKS:");
  });
});

describe("loading src/env.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails fast at import when a required variable is missing", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/env")).rejects.toThrow(/DATABASE_URL: is required/);
  });

  it("skips full validation with SKIP_ENV_VALIDATION=1", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    const { env } = await import("@/env");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("never skips validation on Vercel", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SKIP_ENV_VALIDATION", "1");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("STORAGE_DRIVER", "vercel-blob");
    await expect(import("@/env")).rejects.toThrow(/DATABASE_URL: is required/);
  });

  it("lists every bad variable, public ones included, in one error", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("DATABASE_URL", "");
    await expect(import("@/env")).rejects.toThrow(
      /NEXT_PUBLIC_APP_URL: is required[\s\S]*DATABASE_URL: is required/,
    );
  });

  it("in the browser, exposes public values and refuses server ones", async () => {
    vi.resetModules();
    vi.stubGlobal("window", globalThis);
    try {
      const { env, publicEnv } = await import("@/env");
      expect(publicEnv.NEXT_PUBLIC_APP_URL).toBe(process.env.NEXT_PUBLIC_APP_URL);
      expect(env.NEXT_PUBLIC_APP_URL).toBe(process.env.NEXT_PUBLIC_APP_URL);
      expect(() => env.CRON_SECRET).toThrow(/CRON_SECRET was read in the browser/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe(".env.example", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  // Assigned and commented-out optional variables, e.g. `# SKIP_ENV_VALIDATION="1"`.
  const exampleKeys = new Set(
    [...example.matchAll(/^(?:#\s*)?([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
  );

  it("lists every variable the schema knows (except Vercel's own)", () => {
    const system: readonly string[] = VERCEL_SYSTEM_VARIABLES;
    const missing = ENV_KEYS.filter((key) => !system.includes(key) && !exampleKeys.has(key));
    expect(missing).toEqual([]);
  });

  it("has no variable the schema doesn't validate", () => {
    const unknown = [...exampleKeys].filter((key) => key !== undefined && !ENV_KEYS.includes(key));
    expect(unknown).toEqual([]);
  });
});
