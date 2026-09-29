/**
 * Platform-scope setting definitions (Phase 6).
 *
 * Platform keys own the `platform.*`, `auth.*`, `ai.*`, `module.*`, `jobs.*`, `notifications.*`
 * and `user.*` prefixes (`docs/contracts/module-manifest.md` §Rules 8). Modules add their own
 * keys through their own manifests.
 *
 * Every default here satisfies the schema (`defineSetting` re-checks it).
 */

import { z } from "zod";

import { defineSetting } from "@/platform/registry/define";
import type { SettingDefinition } from "@/contracts/module-manifest";

const TimezoneSchema = z.string().min(3).max(64);
const EmailSchema = z.email();
const UrlSchema = z.url({ protocol: /^https?$/ });

/** Non-secret model tier config (secrets stay in the credentials vault). */
const ModelTiersSchema = z.object({
  fast: z.string().min(1).max(120),
  balanced: z.string().min(1).max(120),
  deep: z.string().min(1).max(120),
  fastFallback: z.string().min(1).max(120).nullable(),
  balancedFallback: z.string().min(1).max(120).nullable(),
  deepFallback: z.string().min(1).max(120).nullable(),
});

const AiBudgetsSchema = z.object({
  platformDailyUsd: z.number().nonnegative().default(50),
  platformMonthlyUsd: z.number().nonnegative().default(1000),
  perModuleDailyUsd: z.record(z.string(), z.number().nonnegative()).default({}),
  perUserDailyCalls: z.int().nonnegative().default(500),
  perTaskMaxTokens: z.int().nonnegative().default(8000),
});

const LogContentOverridesSchema = z.record(z.string(), z.enum(["NONE", "REDACTED", "FULL"]));

export const PLATFORM_SETTINGS: SettingDefinition[] = [
  defineSetting<string>({
    key: "platform.timezone",
    scope: "PLATFORM",
    schema: TimezoneSchema,
    default: "Africa/Lagos",
    label: "Platform timezone",
    description: "Default timezone for schedules, ProviderUsage rollups and the platform home.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<string>({
    key: "platform.companyName",
    scope: "PLATFORM",
    schema: z.string().min(2).max(120),
    default: "FUTUREUNI",
    label: "Company name",
    description: "Legal name used in emails and documents.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<string>({
    key: "platform.postalAddress",
    scope: "PLATFORM",
    schema: z.string().max(500).default(""),
    default: "",
    label: "Postal address",
    description: "Required by INV-4. Cold outreach email is blocked while this is empty.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<string>({
    key: "platform.crawlerContactUrl",
    scope: "PLATFORM",
    schema: UrlSchema.or(z.literal("")).default(""),
    default: "",
    label: "Crawler contact URL",
    description: "Public URL for identifying the FUTUREUNI-Bot crawler (INV-14).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<number>({
    key: "platform.retention.personalDataMonths",
    scope: "PLATFORM",
    schema: z.int().min(1).max(120),
    default: 12,
    label: "Personal data retention (months)",
    description: "Anonymise personal data on DISQUALIFIED and LOST leads after this many months.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "retention",
  }),
  defineSetting<number>({
    key: "platform.retention.jobRunsDays",
    scope: "PLATFORM",
    schema: z.int().min(1).max(365),
    default: 30,
    label: "Job-run log retention (days)",
    description: "Purge succeeded JobRun rows older than this many days.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "retention",
  }),
  defineSetting<number | null>({
    key: "platform.retention.auditLogMonths",
    scope: "PLATFORM",
    schema: z.int().min(1).max(240).nullable(),
    default: null,
    label: "Audit-log retention (months)",
    description: "Purge audit entries older than this many months. null means keep indefinitely.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "retention",
  }),
  defineSetting<boolean>({
    key: "notifications.digest.enabled",
    scope: "PLATFORM",
    schema: z.boolean(),
    default: true,
    label: "Daily notifications digest",
    description: "When true, unread digestible notifications are emailed once a day.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<number>({
    key: "auth.inviteExpiryDays",
    scope: "PLATFORM",
    schema: z.int().min(1).max(30),
    default: 7,
    label: "Invite expiry (days)",
    description: "How long an unaccepted invite stays valid.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<number>({
    key: "auth.sessionDays",
    scope: "PLATFORM",
    schema: z.int().min(1).max(90),
    default: 30,
    label: "Session length (days)",
    description: "Maximum session lifetime with sliding renewal.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  defineSetting<string[]>({
    key: "auth.googleAllowedDomains",
    scope: "PLATFORM",
    schema: z.array(z.string().min(3).max(120)).default([]),
    default: [],
    label: "Google-signin allowed domains",
    description: "Domains that may sign in with Google (empty = disabled).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  // AI settings requested by Phase 5 (SEAM-SETTINGS-AI wires here).
  defineSetting<z.infer<typeof ModelTiersSchema>>({
    key: "ai.modelTiers",
    scope: "PLATFORM",
    schema: ModelTiersSchema,
    default: {
      fast: "claude-haiku-4-5-20251001",
      balanced: "claude-sonnet-5-5",
      deep: "claude-opus-5-5",
      fastFallback: null,
      balancedFallback: null,
      deepFallback: null,
    },
    label: "AI model tiers",
    description: "Which Claude model to use for fast/balanced/deep tiers (ADR-018).",
    sensitive: false,
    requiredPermission: "platform.aiBudget.update",
  }),
  defineSetting<z.infer<typeof AiBudgetsSchema>>({
    key: "ai.budgets",
    scope: "PLATFORM",
    schema: AiBudgetsSchema,
    default: {
      platformDailyUsd: 50,
      platformMonthlyUsd: 1000,
      perModuleDailyUsd: {},
      perUserDailyCalls: 500,
      perTaskMaxTokens: 8000,
    },
    label: "AI budgets",
    description: "Daily and monthly USD budgets and per-user/task caps.",
    sensitive: false,
    requiredPermission: "platform.aiBudget.update",
  }),
  defineSetting<z.infer<typeof LogContentOverridesSchema>>({
    key: "ai.logContentOverrides",
    scope: "PLATFORM",
    schema: LogContentOverridesSchema,
    default: {},
    label: "AI log-content overrides",
    description: "Per-task overrides for how much prompt/response text to store (INV-13).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
  }),
  // User-scope settings.
  defineSetting<"light" | "dark" | "system">({
    key: "user.theme",
    scope: "USER",
    schema: z.enum(["light", "dark", "system"]),
    default: "system",
    label: "Theme",
    description: "Light, dark or follow OS.",
    sensitive: false,
    requiredPermission: "platform.userSettings.update",
  }),
  defineSetting<"comfortable" | "compact">({
    key: "user.density",
    scope: "USER",
    schema: z.enum(["comfortable", "compact"]),
    default: "comfortable",
    label: "Density",
    description: "Row and card density preference.",
    sensitive: false,
    requiredPermission: "platform.userSettings.update",
  }),
  defineSetting<boolean>({
    key: "user.reducedMotion",
    scope: "USER",
    schema: z.boolean(),
    default: false,
    label: "Reduced motion",
    description: "Disables non-essential motion for this account.",
    sensitive: false,
    requiredPermission: "platform.userSettings.update",
  }),
  // Notification-preference defaults (in-app services enforce per-type opt-out; see notifications).
];

/** Also register `module.<id>.enabled` for every module found at codegen. Handled by registry. */

// Also referenced from tests.
export { EmailSchema, TimezoneSchema, UrlSchema };
