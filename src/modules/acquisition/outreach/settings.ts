/**
 * Outreach settings (Phase 12). Send-window defaults, warm-up parameters, caps, the bounce
 * auto-pause threshold, the unsubscribe scope, click tracking (off by default, ADR-031) and the
 * DKIM selector. Registered on the acquisition manifest by Phase 19 through `phases/12/REQUESTS.md`.
 *
 * Keys are dotted and MODULE-scoped. `platform.postalAddress` (INV-4) is a platform setting read
 * directly where the footer is built; it is not redeclared here. The global pause
 * (`acquisition.outreach.globalPause`) defaults to `false` so development and tests can send with
 * mocks; Phase 21 bootstraps production with it `true` until the launch-checklist gates pass
 * (.claude/project-rules.md "Launch gates").
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { getSetting } from "@/platform/settings";
import { defineSetting } from "@/platform/registry/define";

export const OUTREACH_SETTING_KEYS = {
  globalPause: "acquisition.outreach.globalPause",
  unsubscribeScope: "acquisition.unsubscribeScope",
  sendWindowStart: "acquisition.outreach.sendWindowStart",
  sendWindowEnd: "acquisition.outreach.sendWindowEnd",
  sendWindowJitterMinutes: "acquisition.outreach.sendWindowJitterMinutes",
  warmupStartCap: "acquisition.outreach.warmupStartCap",
  dailyCapTarget: "acquisition.outreach.dailyCapTarget",
  warmupRampDays: "acquisition.outreach.warmupRampDays",
  bounceRatePauseThreshold: "acquisition.outreach.bounceRatePauseThreshold",
  healthSampleSize: "acquisition.outreach.healthSampleSize",
  dkimSelector: "acquisition.outreach.dkimSelector",
  clickTracking: "acquisition.outreach.clickTracking",
} as const;

export const UnsubscribeScopeSchema = z.enum(["COMPANY", "CONTACT"]);
export type UnsubscribeScope = z.infer<typeof UnsubscribeScopeSchema>;

/** Defaults, also used as a fallback before Phase 19 registers these settings on the manifest. */
export const OUTREACH_DEFAULTS = {
  globalPause: false,
  unsubscribeScope: "COMPANY" as UnsubscribeScope,
  sendWindowStart: "09:00",
  sendWindowEnd: "17:00",
  sendWindowJitterMinutes: 20,
  warmupStartCap: 5,
  dailyCapTarget: 35,
  warmupRampDays: 24,
  bounceRatePauseThreshold: 0.03,
  healthSampleSize: 100,
  dkimSelector: "google",
  clickTracking: false,
};

/** The number of times a soft bounce is retried before it is treated as a hard bounce (step 4.9). */
export const SOFT_BOUNCE_MAX_RETRIES = 2;

type OutreachSettingKey = keyof typeof OUTREACH_DEFAULTS;

/** Reads an outreach setting, falling back to its default when it isn't registered yet or has no row. */
export async function getOutreachSetting<K extends OutreachSettingKey>(
  key: K,
): Promise<(typeof OUTREACH_DEFAULTS)[K]> {
  try {
    return await getSetting<(typeof OUTREACH_DEFAULTS)[K]>(OUTREACH_SETTING_KEYS[key]);
  } catch {
    return OUTREACH_DEFAULTS[key];
  }
}

export const outreachSettings: SettingDefinition[] = [
  defineSetting<boolean>({
    key: OUTREACH_SETTING_KEYS.globalPause,
    scope: "MODULE",
    schema: z.boolean(),
    default: OUTREACH_DEFAULTS.globalPause,
    label: "Outreach: pause all sending",
    description: "When on, no outreach email is sent and no assisted link is generated. Drafts stay reviewable.",
    sensitive: false,
    requiredPermission: "acquisition.outreach.globalPause",
    group: "outreach",
  }),
  defineSetting<UnsubscribeScope>({
    key: OUTREACH_SETTING_KEYS.unsubscribeScope,
    scope: "MODULE",
    schema: UnsubscribeScopeSchema,
    default: OUTREACH_DEFAULTS.unsubscribeScope,
    label: "Outreach: unsubscribe scope",
    description: "COMPANY suppresses the whole company (and its domain); CONTACT suppresses only the one email.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<string>({
    key: OUTREACH_SETTING_KEYS.sendWindowStart,
    scope: "MODULE",
    schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    default: OUTREACH_DEFAULTS.sendWindowStart,
    label: "Outreach: send window start (recipient local time)",
    description: "The earliest local time a cold email may be sent (24-hour HH:MM).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<string>({
    key: OUTREACH_SETTING_KEYS.sendWindowEnd,
    scope: "MODULE",
    schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    default: OUTREACH_DEFAULTS.sendWindowEnd,
    label: "Outreach: send window end (recipient local time)",
    description: "The latest local time a cold email may be sent (24-hour HH:MM).",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.sendWindowJitterMinutes,
    scope: "MODULE",
    schema: z.int().min(0).max(60),
    default: OUTREACH_DEFAULTS.sendWindowJitterMinutes,
    label: "Outreach: send jitter (minutes)",
    description: "A random delay of up to this many minutes is added so sends do not all land on the hour.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.warmupStartCap,
    scope: "MODULE",
    schema: z.int().min(1).max(200),
    default: OUTREACH_DEFAULTS.warmupStartCap,
    label: "Outreach: warm-up starting daily cap",
    description: "A new mailbox starts at this many sends per day.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.dailyCapTarget,
    scope: "MODULE",
    schema: z.int().min(1).max(200),
    default: OUTREACH_DEFAULTS.dailyCapTarget,
    label: "Outreach: target daily cap",
    description: "The daily send cap a mailbox reaches at the end of its warm-up ramp.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.warmupRampDays,
    scope: "MODULE",
    schema: z.int().min(1).max(60),
    default: OUTREACH_DEFAULTS.warmupRampDays,
    label: "Outreach: warm-up ramp length (days)",
    description: "The number of days a mailbox takes to ramp from the starting cap to the target cap.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.bounceRatePauseThreshold,
    scope: "MODULE",
    schema: z.number().min(0).max(1),
    default: OUTREACH_DEFAULTS.bounceRatePauseThreshold,
    label: "Outreach: hard-bounce auto-pause threshold",
    description: "A mailbox is paused when its hard-bounce rate over the recent sample exceeds this fraction.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<number>({
    key: OUTREACH_SETTING_KEYS.healthSampleSize,
    scope: "MODULE",
    schema: z.int().min(10).max(1_000),
    default: OUTREACH_DEFAULTS.healthSampleSize,
    label: "Outreach: health sample size",
    description: "How many recent sends the bounce-rate auto-pause check looks at.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<string>({
    key: OUTREACH_SETTING_KEYS.dkimSelector,
    scope: "MODULE",
    schema: z.string().min(1).max(63),
    default: OUTREACH_DEFAULTS.dkimSelector,
    label: "Outreach: default DKIM selector",
    description: "The DKIM selector used for DNS checks when a sending domain has none of its own.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
  defineSetting<boolean>({
    key: OUTREACH_SETTING_KEYS.clickTracking,
    scope: "MODULE",
    schema: z.boolean(),
    default: OUTREACH_DEFAULTS.clickTracking,
    label: "Outreach: click tracking",
    description: "Off by default (ADR-031). Link rewriting hurts deliverability on fresh domains; enabling it needs a new ADR.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "outreach",
  }),
];
