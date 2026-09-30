/**
 * Enrichment settings (Phase 9). Registered on the acquisition manifest by Phase 19 through
 * `phases/09/REQUESTS.md`.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";

export const enrichmentSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: "acquisition.enrichment.maxPagesPerCompany",
    scope: "MODULE",
    schema: z.int().min(1).max(50),
    default: 10,
    label: "Enrichment: max pages per company",
    description: "Upper bound on pages the crawler will fetch for a single company.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.batchSize",
    scope: "MODULE",
    schema: z.int().min(1).max(200),
    default: 25,
    label: "Enrichment: batch size",
    description: "How many NEW leads the batch job picks up per tick.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.perOriginDelayMs",
    scope: "MODULE",
    schema: z.int().min(0).max(60_000),
    default: 1_000,
    label: "Enrichment: per-origin delay (ms)",
    description: "Minimum interval between fetches to the same origin.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.finderDailyCap",
    scope: "MODULE",
    schema: z.int().min(0).max(10_000),
    default: 200,
    label: "Email finder: daily cap",
    description: "Maximum email-finder calls the platform is allowed per day.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.finderPerLeadCap",
    scope: "MODULE",
    schema: z.int().min(0).max(50),
    default: 3,
    label: "Email finder: per-lead cap",
    description: "Maximum email-finder calls for one lead.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.reverifyDays",
    scope: "MODULE",
    schema: z.int().min(0).max(365),
    default: 30,
    label: "Email verifier: re-verify after (days)",
    description: "Skip a re-verify while the last one is still within this many days.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
  defineSetting<number>({
    key: "acquisition.enrichment.staleAfterDays",
    scope: "MODULE",
    schema: z.int().min(7).max(365),
    default: 60,
    label: "Enrichment: refresh stale after (days)",
    description: "Refresh a lead whose last enrichment is older than this many days.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "enrichment",
  }),
];
