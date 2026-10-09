import { z } from "zod";

/**
 * The single, validated source of environment variables (`.env.example` lists every one).
 *
 * - `next.config.ts` imports this file, so a missing or malformed variable fails `next dev`,
 *   `next build` and `next typegen` immediately, with a message naming each bad variable
 *   (never its value).
 * - It does not import `server-only`: next.config loads it outside a React server environment.
 *   Instead, in the browser only the public (`NEXT_PUBLIC_*`) part is parsed, and reading a
 *   server variable there throws.
 * - `SKIP_ENV_VALIDATION=1` relaxes validation for tooling steps that lint or typecheck without
 *   real values. Every provided value is still parsed; missing ones stay undefined. It is
 *   ignored on Vercel (`VERCEL=1`), so a deployment is always fully validated.
 * - Provider keys are optional while `MOCKS=true`, and required in the production deployment
 *   (`VERCEL_ENV=production`) when `MOCKS=false` (ADR-005). See phases/01/REQUESTS.md CR-01-11:
 *   Phase 21 reconciles this with the credentials vault, which is read before env keys.
 * - `LIVE_PROVIDERS` lifts single providers out of mock mode while the rest stay mocked, so one
 *   integration can go live without waiting for all ten. A provider named there must carry its
 *   key wherever the app boots, which is checked here rather than at the first call.
 * - On Vercel the local storage driver is rejected: the filesystem there is read-only.
 */

const PLACEHOLDER = "REPLACE_WITH";
const ENV_INIT_HINT = "run `node scripts/env-init.mjs` to generate local values";

const required = {
  error: (issue: { input: unknown }) =>
    issue.input === undefined ? "is required" : "must be text",
};

const text = () => z.string(required).trim().min(1, { error: "is required" });

const secret = (minLength = 32) =>
  text()
    .refine((value) => !value.startsWith(PLACEHOLDER), {
      error: `still has the .env.example placeholder; ${ENV_INIT_HINT}`,
      abort: true,
    })
    .refine((value) => value.length >= minLength, {
      error: `must be at least ${String(minLength)} characters`,
    });

const postgresUrl = () =>
  text().refine((value) => /^postgres(ql)?:\/\/[^\s]+$/.test(value), {
    error: "must be a postgres:// or postgresql:// connection string",
  });

const httpUrl = () =>
  text().refine((value) => /^https?:\/\/[^\s]+$/.test(value) && URL.canParse(value), {
    error: "must be an http(s) URL",
  });

const bool = (fallback: boolean) =>
  z
    .stringbool({ error: 'must be "true" or "false"' })
    .optional()
    .transform((value) => value ?? fallback);

const port = (fallback: number) =>
  z.coerce
    .number({ error: "must be a port number" })
    .int({ error: "must be a port number" })
    .min(1, { error: "must be a port number" })
    .max(65535, { error: "must be a port number" })
    .optional()
    .transform((value) => value ?? fallback);

/** 32 random bytes, base64-encoded (44 characters). Losing it makes stored credentials unrecoverable. */
const encryptionKey = () =>
  text()
    .refine((value) => !value.startsWith(PLACEHOLDER), {
      error: `still has the .env.example placeholder; ${ENV_INIT_HINT}`,
      abort: true,
    })
    .refine(
      (value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32,
      {
        error: "must be 32 bytes encoded as base64 (generate with: openssl rand -base64 32)",
      },
    );

const optional = <T extends z.ZodType>(schema: T) => schema.optional();

/**
 * Providers that can be switched on one at a time through `LIVE_PROVIDERS`, each with the
 * variable carrying its key. This is the single source of truth: `providerEnvKey` in
 * `@/platform/credentials` reads it rather than keeping a second copy.
 */
export const LIVE_PROVIDER_IDS = [
  "anthropic",
  "google-places",
  "pagespeed",
  "youtube-data",
  "serpapi",
  "hunter",
  "companies-house",
  "resend",
  "cal-com",
] as const;
export type LiveProviderId = (typeof LIVE_PROVIDER_IDS)[number];

export const PROVIDER_ENV_KEY = {
  anthropic: "ANTHROPIC_API_KEY",
  "google-places": "GOOGLE_PLACES_API_KEY",
  pagespeed: "PAGESPEED_API_KEY",
  "youtube-data": "YOUTUBE_API_KEY",
  serpapi: "SERPAPI_API_KEY",
  hunter: "HUNTER_API_KEY",
  "companies-house": "COMPANIES_HOUSE_API_KEY",
  resend: "RESEND_API_KEY",
  "cal-com": "CALCOM_API_KEY",
} as const satisfies Record<LiveProviderId, string>;

/** Domains that never reach a real inbox, so a from-address using one is a configuration mistake. */
const RESERVED_EMAIL_TLDS = new Set(["example", "invalid", "test", "localhost"]);

/** `address@domain` or `Display Name <address@domain>`, excluding the reserved documentation TLDs. */
const emailAddress = () =>
  text().refine(
    (value) => {
      const match = /^(?:[^<>]*<\s*([^<>\s]+)\s*>|([^<>\s]+))$/.exec(value.trim());
      const address = match?.[1] ?? match?.[2];
      if (address === undefined) return false;
      const at = address.lastIndexOf("@");
      if (at <= 0 || at === address.length - 1) return false;
      const domain = address.slice(at + 1).toLowerCase();
      if (!domain.includes(".")) return false;
      return !RESERVED_EMAIL_TLDS.has(domain.split(".").pop() ?? "");
    },
    {
      error:
        'must be a deliverable address, on its own or as "Name <address@domain>" (.example and other reserved domains are rejected)',
    },
  );

/** A comma-separated provider list, e.g. `resend,anthropic`. Blank means "mock everything". */
const providerList = () =>
  z
    .string()
    .optional()
    .transform((value) =>
      value === undefined
        ? []
        : value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry !== ""),
    )
    .pipe(
      z.array(
        z.enum(LIVE_PROVIDER_IDS, {
          error: `must name providers from: ${LIVE_PROVIDER_IDS.join(", ")}`,
        }),
      ),
    );

/** Public variables: safe for the browser. Next.js inlines each one only when referenced literally. */
const publicShape = {
  NEXT_PUBLIC_APP_URL: httpUrl(),
  NEXT_PUBLIC_SENTRY_DSN: optional(httpUrl()),
};

const serverShape = {
  ...publicShape,

  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port(3000),
  SKIP_ENV_VALIDATION: optional(z.literal("1")),

  // Mock mode (ADR-005)
  MOCKS: bool(true),
  LIVE_PROVIDERS: providerList(),
  AI_MOCK_FAIL: optional(z.enum(["empty", "invalid", "timeout", "429"])),

  // Database (ADR-004, ADR-019)
  DATABASE_URL: postgresUrl(),
  DIRECT_URL: postgresUrl(),
  DATABASE_URL_TEST: optional(postgresUrl()),
  POSTGRES_PORT: port(5432),
  LOCAL_DB_MODE: optional(z.enum(["native", "docker"])),
  LOCAL_PG_BIN: optional(text()),
  LOCAL_PGDATA: optional(text()),

  // Security secrets
  CREDENTIALS_ENCRYPTION_KEY: encryptionKey(),
  CREDENTIALS_KEY_VERSION: z.coerce
    .number({ error: "must be a whole number" })
    .int()
    .min(1)
    .default(1),
  CRON_SECRET: secret(),
  UNSUBSCRIBE_TOKEN_SECRET: secret(),
  BOOKING_LINK_SECRET: secret(),
  SUPPRESSION_HASH_KEY: secret(),

  // Auth: Better Auth (ADR-013)
  BETTER_AUTH_SECRET: secret(),
  BETTER_AUTH_URL: httpUrl(),
  AUTH_GOOGLE_ENABLED: bool(false),
  GOOGLE_OAUTH_CLIENT_ID: optional(text()),
  GOOGLE_OAUTH_CLIENT_SECRET: optional(text()),
  SEED_USER_PASSWORD: optional(text()),
  SEED_SKIP_2FA: bool(false),
  SEED_ALLOW_REMOTE: optional(z.literal("1")),

  // AI (ADR-006, ADR-018)
  ANTHROPIC_API_KEY: optional(text()),
  AI_MODEL_FAST: optional(text()),
  AI_MODEL_BALANCED: optional(text()),
  AI_MODEL_DEEP: optional(text()),
  AI_MODEL_FAST_FALLBACK: optional(text()),
  AI_MODEL_BALANCED_FALLBACK: optional(text()),
  AI_MODEL_DEEP_FALLBACK: optional(text()),
  EVALS_LIVE_MAX_USD: z.coerce.number({ error: "must be a number" }).positive().default(5),

  // File storage (ADR-003)
  STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: optional(text()),

  // Platform (transactional) email (ADR-023)
  // EMAIL_TRANSPORT chooses the sender explicitly. Unset falls back to the Resend/LIVE_PROVIDERS
  // gate. "smtp" sends through EMAIL_SMTP_* (e.g. the Hostinger mailbox on the sending domain).
  EMAIL_TRANSPORT: optional(z.enum(["mock", "resend", "smtp"])),
  RESEND_API_KEY: optional(text()),
  EMAIL_FROM: optional(emailAddress()),
  EMAIL_REPLY_TO: optional(emailAddress()),
  EMAIL_SMTP_HOST: optional(text()),
  EMAIL_SMTP_PORT: z.coerce
    .number({ error: "must be a port number" })
    .int({ error: "must be a port number" })
    .min(1, { error: "must be a port number" })
    .max(65535, { error: "must be a port number" })
    .optional(),
  EMAIL_SMTP_USER: optional(text()),
  EMAIL_SMTP_PASSWORD: optional(text()),

  // Outreach sending and reply ingestion (ADR-016)
  OUTREACH_SENDER: z.enum(["gmail-api", "smtp", "mock"]).default("mock"),
  INBOUND_SOURCE: z.enum(["gmail-api", "imap", "mock"]).default("mock"),
  GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: optional(text()),
  GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: optional(text()),

  // Sourcing (Phase 8)
  GOOGLE_PLACES_API_KEY: optional(text()),
  SERPAPI_API_KEY: optional(text()),
  ADZUNA_APP_ID: optional(text()),
  ADZUNA_APP_KEY: optional(text()),
  YOUTUBE_API_KEY: optional(text()),

  // Enrichment and compliance (Phase 9)
  HUNTER_API_KEY: optional(text()),
  COMPANIES_HOUSE_API_KEY: optional(text()),

  // Audits (Phase 10, ADR-017)
  PAGESPEED_API_KEY: optional(text()),
  BROWSER_RUNTIME: z
    .enum(["vercel-sandbox", "serverless-chromium", "local-playwright", "mock"])
    .default("mock"),
  VERCEL_SANDBOX_SNAPSHOT_ID: optional(text()),
  BROWSER_FALLBACK_URL: optional(httpUrl()),
  BROWSER_FALLBACK_SIGNING_KEY: optional(secret()),
  CHROMIUM_EXECUTABLE_PATH: optional(text()),

  // Calendar and booking (ADR-021)
  CALCOM_API_KEY: optional(text()),
  CALCOM_WEBHOOK_SECRET: optional(text()),

  // Monitoring: Sentry (ADR-030)
  SENTRY_DSN: optional(httpUrl()),
  SENTRY_AUTH_TOKEN: optional(text()),
  SENTRY_ORG: optional(text()),
  SENTRY_PROJECT: optional(text()),

  // Build-time tooling, read by .mcp.json from the shell (never by the app)
  GITHUB_MCP_PAT: optional(text()),
  CONTEXT7_API_KEY: optional(text()),
  HOSTINGER_API_TOKEN: optional(text()),

  // Set by Vercel at build and runtime (not in .env.example)
  VERCEL: optional(z.literal("1")),
  VERCEL_ENV: optional(z.enum(["development", "preview", "production"])),
  VERCEL_GIT_COMMIT_SHA: optional(text()),
};

/** Variables Vercel sets itself; everything else must appear in `.env.example`. */
export const VERCEL_SYSTEM_VARIABLES = ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA"] as const;

/**
 * Every provider key the platform can use in the production deployment. These are all OPTIONAL at
 * boot: an unset provider is simply skipped at runtime (each adapter resolves a null key, logs, and
 * yields nothing), so the platform can go live paying for one provider at a time. Only the keys in
 * `PRODUCTION_REQUIRED_PROVIDER_KEYS` are enforced.
 */
export const PRODUCTION_PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "SERPAPI_API_KEY",
  "YOUTUBE_API_KEY",
  "HUNTER_API_KEY",
  "COMPANIES_HOUSE_API_KEY",
  "PAGESPEED_API_KEY",
  "RESEND_API_KEY",
  "CALCOM_API_KEY",
  "CALCOM_WEBHOOK_SECRET",
] as const;

/**
 * Provider keys that MUST be present in the production deployment (`VERCEL_ENV=production`) when
 * `MOCKS=false`. Only the AI engine is non-negotiable: scoring, audits and drafting all call it, so
 * a keyless live build is a misconfiguration worth failing at start-up. Every other provider degrades
 * gracefully when absent, so it stays optional (lean/ramped launch, ADR — see docs/integrations.md).
 */
export const PRODUCTION_REQUIRED_PROVIDER_KEYS = ["ANTHROPIC_API_KEY"] as const;

const serverObject = z.object(serverShape);

const serverSchema = serverObject.superRefine((values, ctx) => {
  const missing = (key: keyof typeof values, why: string) => {
    if (values[key] === undefined)
      ctx.addIssue({ code: "custom", path: [key], message: `is required ${why}` });
  };

  if (values.AUTH_GOOGLE_ENABLED) {
    missing("GOOGLE_OAUTH_CLIENT_ID", "when AUTH_GOOGLE_ENABLED=true");
    missing("GOOGLE_OAUTH_CLIENT_SECRET", "when AUTH_GOOGLE_ENABLED=true");
  }

  if (values.VERCEL === "1" && values.STORAGE_DRIVER === "local") {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_DRIVER"],
      message:
        'must be "vercel-blob" on Vercel (the local driver writes to a read-only filesystem)',
    });
  }

  // Without the token the Blob SDK only fails at the first upload, as an unexplained 500. Fail at
  // start-up instead, where the message says what is missing.
  if (values.STORAGE_DRIVER === "vercel-blob") {
    missing("BLOB_READ_WRITE_TOKEN", 'when STORAGE_DRIVER="vercel-blob"');
  }

  // A provider named in LIVE_PROVIDERS talks to the real service even while MOCKS=true, so its key
  // has to be present wherever the app boots — not only in the production deployment. Without this
  // the mistake surfaces as a failed job hours later instead of at start-up.
  for (const id of values.LIVE_PROVIDERS) {
    missing(PROVIDER_ENV_KEY[id], `when LIVE_PROVIDERS includes "${id}"`);
  }
  // The platform-email fallback from-address is a reserved domain, so live Resend without an
  // explicit EMAIL_FROM would be rejected by the provider on every send.
  if (values.LIVE_PROVIDERS.includes("resend")) {
    missing("EMAIL_FROM", 'when LIVE_PROVIDERS includes "resend"');
  }
  // SMTP transport needs its connection settings and a real from-address wherever the app boots,
  // so a misconfiguration fails at start-up instead of on the first send.
  if (values.EMAIL_TRANSPORT === "smtp") {
    const why = 'when EMAIL_TRANSPORT="smtp"';
    missing("EMAIL_SMTP_HOST", why);
    missing("EMAIL_SMTP_PORT", why);
    missing("EMAIL_SMTP_USER", why);
    missing("EMAIL_SMTP_PASSWORD", why);
    missing("EMAIL_FROM", why);
  }

  if (values.VERCEL_ENV === "production" && !values.MOCKS) {
    const why = "in production (VERCEL_ENV=production) when MOCKS=false";
    for (const key of PRODUCTION_REQUIRED_PROVIDER_KEYS) missing(key, why);
    if (values.OUTREACH_SENDER === "gmail-api" || values.INBOUND_SOURCE === "gmail-api") {
      missing("GOOGLE_WORKSPACE_OAUTH_CLIENT_ID", `${why} and Gmail API is selected`);
      missing("GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET", `${why} and Gmail API is selected`);
    }
    if (values.BROWSER_RUNTIME === "vercel-sandbox") {
      missing("VERCEL_SANDBOX_SNAPSHOT_ID", `${why} and BROWSER_RUNTIME=vercel-sandbox`);
    }
    if (values.BROWSER_RUNTIME === "serverless-chromium") {
      missing("BROWSER_FALLBACK_URL", `${why} and BROWSER_RUNTIME=serverless-chromium`);
      missing("BROWSER_FALLBACK_SIGNING_KEY", `${why} and BROWSER_RUNTIME=serverless-chromium`);
    }
  }
});

const publicSchema = z.object(publicShape);

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** Every variable name the schema knows. */
export const ENV_KEYS: readonly string[] = Object.keys(serverShape);

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/** Blank values in .env files mean "not set". */
function normalise(source: EnvSource): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = value === undefined || value.trim() === "" ? undefined : value;
  }
  return out;
}

function describe(issues: readonly z.core.$ZodIssue[]): string {
  const lines = issues.map(
    (issue) => `  - ${issue.path.map(String).join(".") || "(environment)"}: ${issue.message}`,
  );
  return `Invalid environment variables (see .env.example):\n${lines.join("\n")}`;
}

/** Validates a complete environment. Throws `EnvValidationError` listing every bad variable. */
export function parseEnv(source: EnvSource): ServerEnv {
  const result = serverSchema.safeParse(normalise(source));
  if (!result.success) throw new EnvValidationError(describe(result.error.issues));
  return result.data;
}

/** The relaxed parse behind `SKIP_ENV_VALIDATION=1`: provided values are checked, missing ones allowed. */
export function parseEnvLoosely(source: EnvSource): ServerEnv {
  const result = serverObject.partial().safeParse(normalise(source));
  if (!result.success) throw new EnvValidationError(describe(result.error.issues));
  // Deliberate: the one place the full schema is bypassed, and only by explicit opt-in.
  return result.data as ServerEnv;
}

export function parsePublicEnv(source: EnvSource): PublicEnv {
  const result = publicSchema.safeParse(normalise(source));
  if (!result.success) throw new EnvValidationError(describe(result.error.issues));
  return result.data;
}

// Never honoured on Vercel: a deployment is always validated in full.
const skipValidation = process.env.SKIP_ENV_VALIDATION === "1" && process.env.VERCEL !== "1";
const isBrowser = typeof window !== "undefined";

// Listed one by one: Next.js only inlines NEXT_PUBLIC_* values that are referenced literally.
const publicSource: EnvSource = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

// On the server the full environment is parsed first, so one error lists every bad variable.
const serverEnv: ServerEnv | null = isBrowser
  ? null
  : skipValidation
    ? parseEnvLoosely(process.env)
    : parseEnv(process.env);

/** Public (`NEXT_PUBLIC_*`) values: safe to import anywhere, including client components. */
export const publicEnv: PublicEnv =
  serverEnv !== null
    ? {
        NEXT_PUBLIC_APP_URL: serverEnv.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_SENTRY_DSN: serverEnv.NEXT_PUBLIC_SENTRY_DSN,
      }
    : skipValidation
      ? (publicSchema.partial().parse(normalise(publicSource)) as PublicEnv)
      : parsePublicEnv(publicSource);

function browserGuard(): ServerEnv {
  return new Proxy({} as ServerEnv, {
    get(_target, key) {
      if (typeof key !== "string" || !(key in serverShape)) return undefined;
      if (key in publicShape) return publicEnv[key as keyof PublicEnv];
      throw new Error(
        `Server environment variable ${key} was read in the browser. Use publicEnv for NEXT_PUBLIC_* values.`,
      );
    },
  });
}

/** Validated server environment. Import it only from server code. */
export const env: ServerEnv = serverEnv ?? browserGuard();

/**
 * Whether `id` runs against the real service rather than its mock (ADR-005).
 *
 * `MOCKS=false` makes every provider live. While `MOCKS=true`, only the providers named in
 * `LIVE_PROVIDERS` are, which is how one integration goes live before the rest have keys.
 * Server-only: reading `MOCKS` in the browser throws.
 *
 * Takes a plain string, not `LiveProviderId`: `ProviderId` also covers ids with no env key and
 * dynamic ones such as `outreach-mailbox:<cuid>`, and those are live only when `MOCKS=false`.
 */
export function isProviderLive(id: string): boolean {
  // `parseEnvLoosely` (SKIP_ENV_VALIDATION=1) can leave these undefined despite what the types
  // say, so both are read defensively and anything unset means "mocked". Defaulting the other way
  // would turn a half-configured environment into real sends.
  const loose = env as Partial<ServerEnv>;
  if (loose.MOCKS === false) return true;
  const live: readonly string[] | undefined = loose.LIVE_PROVIDERS;
  return live?.includes(id) ?? false;
}
