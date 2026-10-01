/**
 * Warm-up ramp: today's send cap for a mailbox (INV-8; outreach-channel contract). A new mailbox
 * starts at `warmupStartCap` and increases linearly to `dailyCapTarget` over `warmupRampDays`
 * calendar days. Day n is counted in whole calendar days since `warmupStartDate` (both date-only,
 * so no timezone arithmetic is needed).
 */

import type { DailyCapFor } from "@/contracts/outreach-channel";

export interface WarmupParams {
  warmupStartDate: string; // IsoDate, e.g. "2026-10-03"
  warmupStartCap: number;
  dailyCapTarget: number;
  warmupRampDays: number;
}

const DAY_MS = 86_400_000;

function wholeDaysBetween(startIsoDate: string, dayIsoDate: string): number {
  const start = Date.parse(`${startIsoDate}T00:00:00.000Z`);
  const day = Date.parse(`${dayIsoDate}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(day)) return 0;
  return Math.floor((day - start) / DAY_MS);
}

/** Today's cap from warm-up parameters and a date-only `day`. Clamped to [startCap, target]. */
export function dailyCapForParams(params: WarmupParams, day: string): number {
  const { warmupStartCap, dailyCapTarget, warmupRampDays } = params;
  if (dailyCapTarget <= warmupStartCap) return dailyCapTarget;
  const n = wholeDaysBetween(params.warmupStartDate, day);
  if (n <= 0) return warmupStartCap;
  const ramped = warmupStartCap + Math.floor((n * (dailyCapTarget - warmupStartCap)) / warmupRampDays);
  return Math.min(dailyCapTarget, Math.max(warmupStartCap, ramped));
}

/** The {@link DailyCapFor} contract implementation over a {@link MailboxConfig}. */
export const dailyCapFor: DailyCapFor = (mailbox, day) =>
  dailyCapForParams(
    {
      warmupStartDate: mailbox.warmupStartDate,
      warmupStartCap: mailbox.warmupStartCap,
      dailyCapTarget: mailbox.dailyCapTarget,
      warmupRampDays: mailbox.warmupRampDays,
    },
    day,
  );

/** Formats a Date as an IsoDate (YYYY-MM-DD) in the platform timezone (Africa/Lagos). */
export function platformDayIso(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
