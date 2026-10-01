/**
 * Pipeline settings (Phase 14). Dotted keys, read with `getSetting` and registered on the
 * acquisition manifest by Phase 19 through `phases/14/REQUESTS.md`. Until then every read falls
 * back to the in-file default (the module isn't manifest-registered inside this worktree).
 *
 * Money thresholds are basis points or integer minor units; INV-11 forbids floating-point money.
 */

import { z } from "zod";

import type { LeadStatus } from "@/contracts/common";
import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";
import { getSetting } from "@/platform/settings";

export const PIPELINE_SETTING_KEYS = {
  discountApprovalThresholdBps: "acquisition.pipeline.discountApprovalThresholdBps",
  staleDaysByStage: "acquisition.pipeline.staleDaysByStage",
  reminderOffsetsMinutes: "acquisition.pipeline.reminderOffsetsMinutes",
  precallLeadMinutes: "acquisition.pipeline.precallLeadMinutes",
  taxEnabled: "acquisition.pipeline.taxEnabled",
  taxRateBps: "acquisition.pipeline.taxRateBps",
  proposalValidityDays: "acquisition.pipeline.proposalValidityDays",
  defaultBookingUrl: "acquisition.defaultBookingUrl",
  bookingUrl: "acquisition.bookingUrl",
} as const;

/** Stale thresholds (days with no activity) per pipeline stage. */
export type StaleDaysByStage = Partial<Record<LeadStatus, number>>;

export const STALE_DAYS_DEFAULT: StaleDaysByStage = {
  CONTACTED: 5,
  REPLIED: 4,
  MEETING_BOOKED: 7,
  PROPOSAL_SENT: 7,
};

export const PIPELINE_DEFAULTS = {
  discountApprovalThresholdBps: 1_000, // 10%
  staleDaysByStage: STALE_DAYS_DEFAULT,
  reminderOffsetsMinutes: [1_440, 60] as number[], // 24h, 1h before
  precallLeadMinutes: 120, // 2h before
  taxEnabled: false,
  taxRateBps: 750, // 7.5% (Nigerian VAT), off until enabled
  proposalValidityDays: 30,
  defaultBookingUrl: "",
  bookingUrl: "",
} as const;

const StaleDaysSchema = z.record(z.string(), z.int().min(1).max(365));

async function read<T>(key: string, fallback: T, opts?: { userId?: string }): Promise<T> {
  try {
    const value = await getSetting<T | null | undefined>(key, opts);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function getDiscountApprovalThresholdBps(): Promise<number> {
  return read(PIPELINE_SETTING_KEYS.discountApprovalThresholdBps, PIPELINE_DEFAULTS.discountApprovalThresholdBps);
}
export function getStaleDaysByStage(): Promise<StaleDaysByStage> {
  return read<StaleDaysByStage>(PIPELINE_SETTING_KEYS.staleDaysByStage, STALE_DAYS_DEFAULT);
}
export function getReminderOffsetsMinutes(): Promise<number[]> {
  return read<number[]>(PIPELINE_SETTING_KEYS.reminderOffsetsMinutes, [...PIPELINE_DEFAULTS.reminderOffsetsMinutes]);
}
export function getPrecallLeadMinutes(): Promise<number> {
  return read(PIPELINE_SETTING_KEYS.precallLeadMinutes, PIPELINE_DEFAULTS.precallLeadMinutes);
}
export function getProposalValidityDays(): Promise<number> {
  return read(PIPELINE_SETTING_KEYS.proposalValidityDays, PIPELINE_DEFAULTS.proposalValidityDays);
}
export async function getTaxSettings(): Promise<{ enabled: boolean; rateBps: number }> {
  const [enabled, rateBps] = await Promise.all([
    read(PIPELINE_SETTING_KEYS.taxEnabled, PIPELINE_DEFAULTS.taxEnabled),
    read(PIPELINE_SETTING_KEYS.taxRateBps, PIPELINE_DEFAULTS.taxRateBps),
  ]);
  return { enabled, rateBps };
}
/** The owner's own booking URL, falling back to the module default. */
export async function getOwnerBookingUrl(ownerId: string | null): Promise<string> {
  if (ownerId !== null) {
    const perOwner = await read(PIPELINE_SETTING_KEYS.bookingUrl, "", { userId: ownerId });
    if (perOwner !== "") return perOwner;
  }
  return read(PIPELINE_SETTING_KEYS.defaultBookingUrl, PIPELINE_DEFAULTS.defaultBookingUrl);
}

export const pipelineSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: PIPELINE_SETTING_KEYS.discountApprovalThresholdBps,
    scope: "MODULE",
    schema: z.int().min(0).max(10_000),
    default: PIPELINE_DEFAULTS.discountApprovalThresholdBps,
    label: "Pipeline: discount approval threshold (basis points)",
    description:
      "A proposal whose effective discount exceeds this (default 1000 bps = 10%) needs a manager or admin to approve the exception.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<StaleDaysByStage>({
    key: PIPELINE_SETTING_KEYS.staleDaysByStage,
    scope: "MODULE",
    schema: StaleDaysSchema,
    default: STALE_DAYS_DEFAULT,
    label: "Pipeline: stale-lead days per stage",
    description: "A lead with no activity for this many days in its stage is flagged stale and its owner notified.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<number[]>({
    key: PIPELINE_SETTING_KEYS.reminderOffsetsMinutes,
    scope: "MODULE",
    schema: z.array(z.int().min(1).max(10_080)).max(6),
    default: [...PIPELINE_DEFAULTS.reminderOffsetsMinutes],
    label: "Pipeline: meeting reminder offsets (minutes before)",
    description: "The owner is reminded this many minutes before each meeting (default 1440 and 60 — 24h and 1h).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<number>({
    key: PIPELINE_SETTING_KEYS.precallLeadMinutes,
    scope: "MODULE",
    schema: z.int().min(15).max(1_440),
    default: PIPELINE_DEFAULTS.precallLeadMinutes,
    label: "Pipeline: pre-call brief lead time (minutes before)",
    description: "A pre-call brief is generated this many minutes before a meeting (default 120 — 2h).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<boolean>({
    key: PIPELINE_SETTING_KEYS.taxEnabled,
    scope: "MODULE",
    schema: z.boolean(),
    default: PIPELINE_DEFAULTS.taxEnabled,
    label: "Pipeline: charge tax on proposals",
    description: "When on, proposals add tax at the configured rate (for example Nigerian VAT). Off by default.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<number>({
    key: PIPELINE_SETTING_KEYS.taxRateBps,
    scope: "MODULE",
    schema: z.int().min(0).max(10_000),
    default: PIPELINE_DEFAULTS.taxRateBps,
    label: "Pipeline: tax rate (basis points)",
    description: "The tax rate applied when tax is on (default 750 bps = 7.5%).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<number>({
    key: PIPELINE_SETTING_KEYS.proposalValidityDays,
    scope: "MODULE",
    schema: z.int().min(1).max(365),
    default: PIPELINE_DEFAULTS.proposalValidityDays,
    label: "Pipeline: proposal validity (days)",
    description: "A new proposal is valid for this many days by default before it expires.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<string>({
    key: PIPELINE_SETTING_KEYS.defaultBookingUrl,
    scope: "MODULE",
    schema: z.union([z.literal(""), z.url()]),
    default: PIPELINE_DEFAULTS.defaultBookingUrl,
    label: "Booking: default booking URL",
    description: "The fallback booking link used when an owner has no personal booking URL.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "pipeline",
  }),
  defineSetting<string>({
    key: PIPELINE_SETTING_KEYS.bookingUrl,
    scope: "USER",
    schema: z.union([z.literal(""), z.url()]),
    default: PIPELINE_DEFAULTS.bookingUrl,
    label: "Booking: my booking URL",
    description: "This user's personal booking link (Cal.com), used for per-lead booking links.",
    sensitive: false,
    requiredPermission: "platform.userSettings.update",
    group: "pipeline",
  }),
];
