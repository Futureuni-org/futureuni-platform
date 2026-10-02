/**
 * Inbox settings (Phase 13). SLA target, the classification confidence threshold, the default
 * nurture horizon and the out-of-office pause fallback. Registered on the acquisition manifest by
 * Phase 19 through `phases/13/REQUESTS.md`.
 *
 * The unsubscribe scope is shared with Phase 12: the same key `acquisition.unsubscribeScope` is read
 * directly (not redeclared here) so a `COMPANY`-scope unsubscribe reply suppresses the domain too.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { getSetting } from "@/platform/settings";
import { defineSetting } from "@/platform/registry/define";

export const INBOX_SETTING_KEYS = {
  slaBusinessHours: "acquisition.inbox.slaBusinessHours",
  confidenceThreshold: "acquisition.inbox.confidenceThreshold",
  defaultNurtureDays: "acquisition.inbox.defaultNurtureDays",
  outOfOfficeFallbackDays: "acquisition.inbox.outOfOfficeFallbackDays",
} as const;

/** The unsubscribe-scope key shared with Phase 12 (not redeclared; read directly). */
export const UNSUBSCRIBE_SCOPE_KEY = "acquisition.unsubscribeScope";

/** Fraction of the SLA elapsed at which the owner is warned (module spec §3.12: 75%). */
export const SLA_WARN_FRACTION = 0.75;

export const INBOX_DEFAULTS = {
  slaBusinessHours: 4,
  confidenceThreshold: 0.6,
  defaultNurtureDays: 90,
  outOfOfficeFallbackDays: 7,
} as const;

type InboxSettingKey = keyof typeof INBOX_DEFAULTS;

/** Reads an inbox setting, falling back to its default when it isn't registered yet or has no row. */
export async function getInboxSetting<K extends InboxSettingKey>(
  key: K,
): Promise<(typeof INBOX_DEFAULTS)[K]> {
  try {
    return await getSetting<(typeof INBOX_DEFAULTS)[K]>(INBOX_SETTING_KEYS[key]);
  } catch {
    return INBOX_DEFAULTS[key];
  }
}

/** Reads the shared unsubscribe scope (COMPANY | CONTACT); defaults to COMPANY like Phase 12. */
export async function getUnsubscribeScope(): Promise<"COMPANY" | "CONTACT"> {
  try {
    return await getSetting<"COMPANY" | "CONTACT">(UNSUBSCRIBE_SCOPE_KEY);
  } catch {
    return "COMPANY";
  }
}

export const inboxSettings: SettingDefinition[] = [
  defineSetting<number>({
    key: INBOX_SETTING_KEYS.slaBusinessHours,
    scope: "MODULE",
    schema: z.int().min(1).max(72),
    default: INBOX_DEFAULTS.slaBusinessHours,
    label: "Inbox: reply SLA (business hours)",
    description:
      "An actionable reply must get a first human response within this many business hours, in the owner's timezone and working hours.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "inbox",
  }),
  defineSetting<number>({
    key: INBOX_SETTING_KEYS.confidenceThreshold,
    scope: "MODULE",
    schema: z.number().min(0).max(1),
    default: INBOX_DEFAULTS.confidenceThreshold,
    label: "Inbox: classification confidence threshold",
    description:
      "A reply classified below this confidence is flagged for human review. The sequence is stopped regardless.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "inbox",
  }),
  defineSetting<number>({
    key: INBOX_SETTING_KEYS.defaultNurtureDays,
    scope: "MODULE",
    schema: z.int().min(1).max(365),
    default: INBOX_DEFAULTS.defaultNurtureDays,
    label: "Inbox: default nurture horizon (days)",
    description:
      "How far ahead a NOT_NOW reply parks a lead when it carries no explicit follow-up date.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "inbox",
  }),
  defineSetting<number>({
    key: INBOX_SETTING_KEYS.outOfOfficeFallbackDays,
    scope: "MODULE",
    schema: z.int().min(1).max(60),
    default: INBOX_DEFAULTS.outOfOfficeFallbackDays,
    label: "Inbox: out-of-office pause fallback (days)",
    description:
      "How long an out-of-office auto-reply pauses the sequence when no return date can be read.",
    sensitive: false,
    requiredPermission: "platform.setting.update",
    group: "inbox",
  }),
];
