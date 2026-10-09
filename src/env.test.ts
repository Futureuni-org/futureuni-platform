import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENV_KEYS,
  type EnvSource,
  EnvValidationError,
  parseEnv,
  PRODUCTION_PROVIDER_KEYS,
  PRODUCTION_REQUIRED_PROVIDER_KEYS,
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

  it("requires the AI engine key in the production deployment when MOCKS=false", () => {
    const message = messageOf({ ...valid, ...vercelProduction, MOCKS: "false" });
    for (const key of PRODUCTION_REQUIRED_PROVIDER_KEYS) {
      expect(message).toContain(
        `${key}: is required in production (VERCEL_ENV=production) when MOCKS=false`,
      );
    }
  });

  it("keeps the other provider keys optional in production (lean/ramped launch)", () => {
    const required: readonly string[] = PRODUCTION_REQUIRED_PROVIDER_KEYS;
    const optional = PRODUCTION_PROVIDER_KEYS.filter((key) => !required.includes(key));
    // Only the required AI key is set; a live build boots without SerpApi, Hunter, Cal.com, etc.
    expect(() =>
      parseEnv({
        ...valid,
        ...vercelProduction,
        MOCKS: "false",
        ANTHROPIC_API_KEY: "sk-ant-test-key",
      }),
    ).not.toThrow();
    const message = messageOf({ ...valid, ...vercelProduction, MOCKS: "false" });
    for (const key of optional) {
      expect(message).not.toContain(`${key}: is required`);
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

  describe("LIVE_PROVIDERS", () => {
    const liveResend = {
      LIVE_PROVIDERS: "resend",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "FUTUREUNI Platform <notifications@mail.futureuni.org>",
    };
    /** The from-address configured in the production deployment (project-rules, ADR-023). */
    const liveFromOnly = { EMAIL_FROM: "FUTUREUNI Platform <info@futureuni.org>" };

    it("defaults to an empty list, leaving every provider mocked", () => {
      expect(parseEnv(valid).LIVE_PROVIDERS).toEqual([]);
    });

    it("accepts a single live provider with its key and from-address", () => {
      expect(parseEnv({ ...valid, ...liveResend }).LIVE_PROVIDERS).toEqual(["resend"]);
    });

    it("accepts a comma-separated list, ignoring surrounding spaces", () => {
      expect(
        parseEnv({
          ...valid,
          ...liveResend,
          LIVE_PROVIDERS: " resend , anthropic ",
          ANTHROPIC_API_KEY: "sk-ant-test",
        }).LIVE_PROVIDERS,
      ).toEqual(["resend", "anthropic"]);
    });

    it("requires the key of each live provider, even outside production", () => {
      const message = messageOf({ ...valid, ...liveResend, RESEND_API_KEY: undefined });
      expect(message).toContain(
        'RESEND_API_KEY: is required when LIVE_PROVIDERS includes "resend"',
      );
    });

    it("requires EMAIL_FROM when Resend is live, because the fallback is unroutable", () => {
      const message = messageOf({ ...valid, ...liveResend, EMAIL_FROM: undefined });
      expect(message).toContain('EMAIL_FROM: is required when LIVE_PROVIDERS includes "resend"');
    });

    it("rejects a provider name it doesn't know", () => {
      expect(messageOf({ ...valid, LIVE_PROVIDERS: "resend,postmark" })).toContain(
        "LIVE_PROVIDERS.1: must name providers from:",
      );
    });

    it("rejects a from-address on a reserved domain", () => {
      expect(
        messageOf({
          ...valid,
          ...liveResend,
          EMAIL_FROM: "FUTUREUNI Platform <notifications@futureuni.example>",
        }),
      ).toContain("EMAIL_FROM: must be a deliverable address");
    });

    it("rejects a from-address that isn't an address at all", () => {
      expect(messageOf({ ...valid, ...liveResend, EMAIL_FROM: "FUTUREUNI Platform" })).toContain(
        "EMAIL_FROM: must be a deliverable address",
      );
    });

    // The shape actually configured on Vercel. These two assertions are what stand between a
    // deploy and a production boot failure, since a bad environment fails at start-up by design.
    it("accepts the deployed production environment, which mocks everything", () => {
      const env = parseEnv({ ...valid, ...vercelProduction, MOCKS: "true", ...liveFromOnly });
      expect(env.LIVE_PROVIDERS).toEqual([]);
      expect(env.EMAIL_FROM).toBe("FUTUREUNI Platform <info@futureuni.org>");
    });

    it("accepts that same environment once Resend alone is switched live", () => {
      const env = parseEnv({
        ...valid,
        ...vercelProduction,
        MOCKS: "true",
        ...liveFromOnly,
        LIVE_PROVIDERS: "resend",
        RESEND_API_KEY: "re_test_key",
      });
      expect(env.LIVE_PROVIDERS).toEqual(["resend"]);
      // The other nine stay mocked, which is the whole point of the switch.
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    });
  });

  describe("EMAIL_TRANSPORT=smtp", () => {
    const smtp = {
      EMAIL_TRANSPORT: "smtp",
      EMAIL_SMTP_HOST: "smtp.hostinger.com",
      EMAIL_SMTP_PORT: "465",
      EMAIL_SMTP_USER: "info@futureuni.org",
      EMAIL_SMTP_PASSWORD: "mailbox-secret",
      EMAIL_FROM: "FUTUREUNI Platform <info@futureuni.org>",
    };

    it("accepts a full SMTP configuration and coerces the port to a number", () => {
      const env = parseEnv({ ...valid, ...smtp });
      expect(env.EMAIL_TRANSPORT).toBe("smtp");
      expect(env.EMAIL_SMTP_PORT).toBe(465);
    });

    it("accepts the deployed SMTP shape (MOCKS=true, email driven by EMAIL_TRANSPORT)", () => {
      expect(() =>
        parseEnv({ ...valid, ...vercelProduction, MOCKS: "true", ...smtp }),
      ).not.toThrow();
    });

    it("requires every SMTP setting and the from-address when the transport is smtp", () => {
      const message = messageOf({
        ...valid,
        EMAIL_TRANSPORT: "smtp",
        EMAIL_SMTP_HOST: undefined,
        EMAIL_SMTP_PORT: undefined,
        EMAIL_SMTP_USER: undefined,
        EMAIL_SMTP_PASSWORD: undefined,
        EMAIL_FROM: undefined,
      });
      for (const key of [
        "EMAIL_SMTP_HOST",
        "EMAIL_SMTP_PORT",
        "EMAIL_SMTP_USER",
        "EMAIL_SMTP_PASSWORD",
        "EMAIL_FROM",
      ]) {
        expect(message).toContain(`${key}: is required when EMAIL_TRANSPORT="smtp"`);
      }
    });

    it("rejects an unknown transport name", () => {
      expect(messageOf({ ...valid, EMAIL_TRANSPORT: "sendgrid" })).toContain("EMAIL_TRANSPORT:");
    });
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
