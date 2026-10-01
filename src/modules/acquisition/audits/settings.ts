/**
 * Audit settings (Phase 10). Registered on the acquisition manifest by Phase 19 through
 * `phases/10/REQUESTS.md` (same pattern as enrichment). Read defensively through `./config` so the
 * module works before the manifest registration lands.
 *
 * Screenshot retention is a platform concern (`platform.retention.screenshotsDays`, default 90,
 * read by `@/platform/browser`); see `phases/10/REQUESTS.md`.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";

export const AUDIT_SETTING_KEYS = {
  perLeadCostCapMicros: "acquisition.audits.perLeadCostCapMicros",
  cacheTtlDays: "acquisition.audits.cacheTtlDays",
  maxRequiredFailures: "acquisition.audits.maxRequiredFailures",
  batchSize: "acquisition.audits.batchSize",
  refreshOlderThanDays: "acquisition.audits.refreshOlderThanDays",
  pagespeedMinScore: "acquisition.audits.pagespeedMinScore",
  pagespeedMaxLcpMs: "acquisition.audits.pagespeedMaxLcpMs",
  videoGoneQuietDays: "acquisition.audits.videoGoneQuietDays",
} as const;

/** Defaults, also used as the fallback when the setting isn't registered yet (pre-Phase-19). */
export const AUDIT_SETTING_DEFAULTS = {
  perLeadCostCapMicros: 150_000, // $0.15 per lead across captures, provider APIs and AI
  cacheTtlDays: 7,
  maxRequiredFailures: 3,
  batchSize: 25,
  refreshOlderThanDays: 30,
  pagespeedMinScore: 50,
  pagespeedMaxLcpMs: 4_000,
  videoGoneQuietDays: 45,
} as const;

export const auditSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.perLeadCostCapMicros,
    scope: "MODULE",
    schema: z.int().min(0).max(10_000_000),
    default: AUDIT_SETTING_DEFAULTS.perLeadCostCapMicros,
    label: "Audits: per-lead cost cap (micro-USD)",
    description: "Maximum spend per lead across captures, provider APIs and AI before further checks are skipped.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.cacheTtlDays,
    scope: "MODULE",
    schema: z.int().min(1).max(90),
    default: AUDIT_SETTING_DEFAULTS.cacheTtlDays,
    label: "Audits: domain cache TTL (days)",
    description: "How long domain-level results (PageSpeed, captures) are reused across leads for the same company.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.maxRequiredFailures,
    scope: "MODULE",
    schema: z.int().min(1).max(10),
    default: AUDIT_SETTING_DEFAULTS.maxRequiredFailures,
    label: "Audits: max required-check failures",
    description: "After this many failed attempts of a required audit, the lead returns to ENRICHED for manual review.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.batchSize,
    scope: "MODULE",
    schema: z.int().min(1).max(200),
    default: AUDIT_SETTING_DEFAULTS.batchSize,
    label: "Audits: batch size",
    description: "How many ENRICHED leads the batch job picks up per tick.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.refreshOlderThanDays,
    scope: "MODULE",
    schema: z.int().min(1).max(365),
    default: AUDIT_SETTING_DEFAULTS.refreshOlderThanDays,
    label: "Audits: refresh older than (days)",
    description: "Re-audit active leads whose last audit is older than this before a new sequence step.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.pagespeedMinScore,
    scope: "MODULE",
    schema: z.int().min(0).max(100),
    default: AUDIT_SETTING_DEFAULTS.pagespeedMinScore,
    label: "Audits: PageSpeed poor-score threshold",
    description: "A performance score below this is treated as poor (default line-reference threshold).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.pagespeedMaxLcpMs,
    scope: "MODULE",
    schema: z.int().min(500).max(60_000),
    default: AUDIT_SETTING_DEFAULTS.pagespeedMaxLcpMs,
    label: "Audits: PageSpeed poor-LCP threshold (ms)",
    description: "An LCP above this is treated as poor (default line-reference threshold).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
  defineSetting<number>({
    key: AUDIT_SETTING_KEYS.videoGoneQuietDays,
    scope: "MODULE",
    schema: z.int().min(7).max(365),
    default: AUDIT_SETTING_DEFAULTS.videoGoneQuietDays,
    label: "Audits: video gone-quiet threshold (days)",
    description: "A channel whose latest upload is older than this (with a growing gap) is flagged gone_quiet.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "audits",
  }),
];
