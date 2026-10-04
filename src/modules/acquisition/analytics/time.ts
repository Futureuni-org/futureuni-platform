/**
 * Time, date-range and timezone helpers for analytics (module spec §3.14; INV-12).
 *
 * Period views bucket in the platform timezone (`Africa/Lagos`); the reply heatmap buckets in the
 * recipient's local time. Every function is pure and takes the instants it needs, so callers pass
 * an injectable `now()` and tests are deterministic. No timezone library is used: `Intl` with a
 * fixed `timeZone` gives the civil parts, and a one-step offset search converts a wall-clock time
 * back to a UTC instant (correct for fixed-offset and DST zones alike).
 */

import type { Market } from "@/contracts/common";

/** The platform timezone: all period bucketing uses this (module spec §3.14). */
export const PLATFORM_TIMEZONE = "Africa/Lagos";

/** The date-range presets offered in the UI, plus `custom` for an explicit from/to. */
export type RangePreset = "7d" | "30d" | "90d" | "qtd" | "ytd" | "custom";

export const RANGE_PRESETS: readonly RangePreset[] = ["7d", "30d", "90d", "qtd", "ytd", "custom"];

/** Time-series bucket size. */
export type Granularity = "day" | "week" | "month";

export interface DateRange {
  from: Date;
  to: Date;
}

interface WallParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const PART_FORMAT = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = PART_FORMAT.get(timeZone);
  if (existing !== undefined) return existing;
  const created = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  PART_FORMAT.set(timeZone, created);
  return created;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface ZonedParts extends WallParts {
  /** 0 = Sunday … 6 = Saturday, in the given timezone. */
  weekday: number;
}

/** The civil (wall-clock) parts of an instant in a timezone. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  // Intl renders midnight as "24" in some engines; normalise to 0.
  const rawHour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** The timezone's offset from UTC, in milliseconds, at a given instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/** Converts a wall-clock time in a timezone to the UTC instant it names. */
export function zonedWallToUtc(wall: WallParts, timeZone: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const offset = offsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/** The `YYYY-MM-DD` day key of an instant in a timezone (the period-view day bucket). */
export function dayKey(instant: Date, timeZone: string = PLATFORM_TIMEZONE): string {
  const p = zonedParts(instant, timeZone);
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${String(p.year)}-${mm}-${dd}`;
}

/** Start of the given instant's day, as a UTC instant, in the platform timezone. */
export function startOfDay(instant: Date, timeZone: string = PLATFORM_TIMEZONE): Date {
  const p = zonedParts(instant, timeZone);
  return zonedWallToUtc({ ...p, hour: 0, minute: 0, second: 0 }, timeZone);
}

/** Start of the ISO week (Monday) containing the instant, in the platform timezone. */
export function startOfWeek(instant: Date, timeZone: string = PLATFORM_TIMEZONE): Date {
  const day = startOfDay(instant, timeZone);
  const weekday = zonedParts(day, timeZone).weekday; // 0=Sun … 6=Sat
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * 86_400_000);
}

/** Start of the month containing the instant, in the platform timezone. */
export function startOfMonth(instant: Date, timeZone: string = PLATFORM_TIMEZONE): Date {
  const p = zonedParts(instant, timeZone);
  return zonedWallToUtc({ ...p, day: 1, hour: 0, minute: 0, second: 0 }, timeZone);
}

function startOfQuarter(instant: Date, timeZone: string = PLATFORM_TIMEZONE): Date {
  const p = zonedParts(instant, timeZone);
  const quarterStartMonth = Math.floor((p.month - 1) / 3) * 3 + 1;
  return zonedWallToUtc(
    { ...p, month: quarterStartMonth, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

function startOfYear(instant: Date, timeZone: string = PLATFORM_TIMEZONE): Date {
  const p = zonedParts(instant, timeZone);
  return zonedWallToUtc(
    { ...p, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

export interface ResolveRangeInput {
  preset: RangePreset;
  /** Required when `preset` is `custom`; ISO date strings (`YYYY-MM-DD`) or instants. */
  from?: Date;
  to?: Date;
}

const DAY_MS = 86_400_000;

/**
 * Resolves a range request to a concrete `{ from, to }` window, in the platform timezone.
 * Rolling presets end at `now`; `qtd`/`ytd` start at the current quarter/year boundary.
 */
export function resolveRange(input: ResolveRangeInput, now: Date): DateRange {
  switch (input.preset) {
    case "7d":
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: now };
    case "30d":
      return { from: new Date(now.getTime() - 30 * DAY_MS), to: now };
    case "90d":
      return { from: new Date(now.getTime() - 90 * DAY_MS), to: now };
    case "qtd":
      return { from: startOfQuarter(now), to: now };
    case "ytd":
      return { from: startOfYear(now), to: now };
    case "custom": {
      const from = input.from ?? new Date(now.getTime() - 30 * DAY_MS);
      const to = input.to ?? now;
      return { from, to };
    }
  }
}

/**
 * The window of equal length immediately before `range`, for previous-period comparison. The
 * previous window ends exactly where the current one begins.
 */
export function previousPeriod(range: DateRange): DateRange {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: range.from };
}

// ---------------------------------------------------------------------------
// Recipient timezone (reply heatmap)
// ---------------------------------------------------------------------------

/** ISO alpha-2 country → representative IANA timezone, for the recipient-local heatmap. */
export const COUNTRY_TIMEZONE: Record<string, string> = {
  NG: "Africa/Lagos",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  US: "America/New_York",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
  AE: "Asia/Dubai",
};

/**
 * The recipient's local timezone for heatmap bucketing. Falls back to the market default
 * (`Africa/Lagos` for Nigeria, UTC for international) when the country is unknown, so a bucket is
 * always produced. The mapping is representative, not per-city precise (module spec §3.14).
 */
export function recipientTimezone(market: Market, country: string | null): string {
  if (country !== null) {
    const mapped = COUNTRY_TIMEZONE[country.toUpperCase()];
    if (mapped !== undefined) return mapped;
  }
  return market === "NIGERIA" ? PLATFORM_TIMEZONE : "UTC";
}

export interface WeekdayHour {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** 0-23. */
  hour: number;
}

/** The weekday and hour of an instant in a timezone (the heatmap cell for a send/reply). */
export function weekdayHour(instant: Date, timeZone: string): WeekdayHour {
  const p = zonedParts(instant, timeZone);
  return { weekday: p.weekday, hour: p.hour };
}
