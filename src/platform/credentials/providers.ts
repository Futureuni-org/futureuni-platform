/**
 * The provider registry. Each provider declares its payload shape and a cheap `test()` call
 * (`docs/integrations.md`).
 *
 * `test()` runs in mock mode by returning success without network access. Real implementations
 * arrive with the module phase that needs them (Phase 8 sourcing, Phase 9 enrichment, ...).
 */

import "server-only";

import { z } from "zod";

import { env, PROVIDER_ENV_KEY, type LiveProviderId } from "@/env";
import type { ProviderId } from "@/contracts/common";

/** A password-shaped API key: a single opaque token. */
const ApiKeySchema = z.object({ apiKey: z.string().min(4).max(2048) });
/** Key + shared secret (Adzuna). */
const AppIdSecretSchema = z.object({
  appId: z.string().min(2).max(200),
  appSecret: z.string().min(4).max(2048),
});
/** OAuth (Google Workspace, Cal.com). */
export const OAuthSchema = z.object({
  clientId: z.string().min(2).max(200),
  clientSecret: z.string().min(4).max(2048),
  refreshToken: z.string().min(4).max(4096).optional(),
});
/** SMTP mailbox credentials (an outreach mailbox on Zoho, Hostinger or any SMTP host). */
export const SmtpSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(320),
  pass: z.string().min(1).max(1024),
  secure: z.boolean().optional(),
});
/** What a mailbox's vault entry (`outreach-mailbox:<id>`) can hold: SMTP creds or Gmail OAuth. */
export const MailboxCredentialSchema = z.union([SmtpSchema, OAuthSchema]);

export type CredentialPayload =
  | z.infer<typeof ApiKeySchema>
  | z.infer<typeof AppIdSecretSchema>
  | z.infer<typeof OAuthSchema>
  | z.infer<typeof SmtpSchema>;

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  category: "ai" | "sourcing" | "enrichment" | "audit" | "email" | "calendar" | "outreach";
  schema: z.ZodType<CredentialPayload>;
  docsUrl: string;
  signupUrl?: string;
  /** A cheap read-only call. Returns `{ ok: false, error }` on failure. Never throws. */
  test: (payload: CredentialPayload) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Which field of the payload to hint as a masked string (first 4 + last 4 of the value). */
  hintFrom:
    | keyof z.infer<typeof ApiKeySchema>
    | keyof z.infer<typeof AppIdSecretSchema>
    | keyof z.infer<typeof OAuthSchema>
    | keyof z.infer<typeof SmtpSchema>;
}

const mockOk = (): Promise<{ ok: true }> => Promise.resolve({ ok: true });

/**
 * Static provider registry. Every provider in `docs/integrations.md` appears here.
 * Real `test()` implementations arrive with the module phase that owns the adapter.
 * Outreach mailboxes (`outreach-mailbox:<id>`) are dynamic and handled separately.
 */
const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    category: "ai",
    schema: ApiKeySchema,
    docsUrl: "https://docs.anthropic.com",
    signupUrl: "https://console.anthropic.com",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "google-places",
    label: "Google Places API",
    category: "sourcing",
    schema: ApiKeySchema,
    docsUrl: "https://developers.google.com/maps/documentation/places/web-service",
    signupUrl: "https://console.cloud.google.com",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "pagespeed",
    label: "PageSpeed Insights",
    category: "audit",
    schema: ApiKeySchema,
    docsUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "youtube-data",
    label: "YouTube Data API",
    category: "sourcing",
    schema: ApiKeySchema,
    docsUrl: "https://developers.google.com/youtube/v3",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "serpapi",
    label: "SerpAPI",
    category: "sourcing",
    schema: ApiKeySchema,
    docsUrl: "https://serpapi.com/",
    signupUrl: "https://serpapi.com/users/sign_up",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "adzuna",
    label: "Adzuna",
    category: "sourcing",
    schema: AppIdSecretSchema,
    docsUrl: "https://developer.adzuna.com/",
    signupUrl: "https://developer.adzuna.com/signup",
    test: mockOk,
    hintFrom: "appSecret",
  },
  {
    id: "hunter",
    label: "Hunter.io",
    category: "enrichment",
    schema: ApiKeySchema,
    docsUrl: "https://hunter.io/api-documentation",
    signupUrl: "https://hunter.io/users/sign_up",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "companies-house",
    label: "UK Companies House",
    category: "enrichment",
    schema: ApiKeySchema,
    docsUrl: "https://developer.company-information.service.gov.uk/",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "resend",
    label: "Resend (platform email)",
    category: "email",
    schema: ApiKeySchema,
    docsUrl: "https://resend.com/docs",
    signupUrl: "https://resend.com/signup",
    test: mockOk,
    hintFrom: "apiKey",
  },
  {
    id: "cal-com",
    label: "Cal.com (booking)",
    category: "calendar",
    schema: ApiKeySchema,
    docsUrl: "https://cal.com/docs",
    signupUrl: "https://cal.com/signup",
    test: mockOk,
    hintFrom: "apiKey",
  },
];

const BY_ID = new Map<string, ProviderDefinition>(PROVIDERS.map((p) => [p.id, p]));

/** All static providers. Outreach mailboxes (Phase 12) register dynamically. */
export function listProviders(): readonly ProviderDefinition[] {
  return PROVIDERS;
}

const MAILBOX_PROVIDER = /^outreach-mailbox:[a-z0-9]{20,32}$/;

/**
 * Verifies a mailbox credential. For SMTP it opens a real connection and authenticates (the "test
 * connection" button), but only when live: in mock mode it returns success without touching the
 * network, matching the static providers. OAuth mailboxes have no cheap offline check here.
 */
async function testMailboxCredential(
  payload: CredentialPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!("host" in payload)) return { ok: true };
  if (env.MOCKS) return { ok: true };
  const smtp = payload;
  try {
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure ?? smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
    });
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "SMTP verification failed",
    };
  }
}

/** The dynamic definition for an outreach mailbox's vault entry (`outreach-mailbox:<id>`). */
function mailboxProvider(id: ProviderId): ProviderDefinition {
  return {
    id,
    label: "Outreach mailbox",
    category: "outreach",
    schema: MailboxCredentialSchema,
    docsUrl: "https://nodemailer.com/smtp/",
    test: testMailboxCredential,
    hintFrom: "user",
  };
}

export function getProvider(id: ProviderId): ProviderDefinition | null {
  const stat = BY_ID.get(id);
  if (stat !== undefined) return stat;
  return MAILBOX_PROVIDER.test(id) ? mailboxProvider(id) : null;
}

/**
 * The env-variable name that carries a provider's key, used by `resolveProviderKey` fallback.
 * `PROVIDER_ENV_KEY` in `@/env` is the source of truth; ids absent from it (adzuna, browser,
 * `outreach-mailbox:<id>`) have no env fallback.
 */
export function providerEnvKey(id: ProviderId): string | null {
  return Object.prototype.hasOwnProperty.call(PROVIDER_ENV_KEY, id)
    ? PROVIDER_ENV_KEY[id as LiveProviderId]
    : null;
}

/**
 * The raw value of a provider's key variable, or null when it has none or it is blank.
 *
 * Deliberately ungated: mock mode is enforced once, by `resolveProviderKey`, which is the function
 * whose contract is "a key for calling out". `resolveWebhookSecret` reads the same value without
 * that gate, because verifying an inbound webhook must work whether or not the provider is mocked.
 */
export function readProviderEnvKey(id: ProviderId): string | null {
  const key = providerEnvKey(id);
  if (key === null) return null;
  const value = (env as unknown as Record<string, string | undefined>)[key];
  return value !== undefined && value.trim() !== "" ? value : null;
}

/** Masks the "shown" field of a payload: first 4 + `…` + last 4. */
export function maskHint(
  payload: CredentialPayload,
  hintFrom: ProviderDefinition["hintFrom"],
): string {
  const value = (payload as Record<string, unknown>)[hintFrom];
  if (typeof value !== "string" || value.length === 0) return "…";
  if (value.length <= 8) return `${value.slice(0, 1)}…${value.slice(-1)}`;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
