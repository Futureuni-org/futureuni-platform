/**
 * Send windows and business days in the recipient's timezone (INV-8, INV-12). No business logic
 * here calls `Date.now()`; callers pass the current instant. All arithmetic is DST-safe because it
 * converts a desired wall-clock time in the target zone to a UTC instant via the zone's offset at
 * that instant.
 */

import type {
  NextSendSlot,
  ResolveRecipientTimezone,
  SendWindow,
} from "@/contracts/outreach-channel";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Single-zone countries we prospect in (docs/contracts/outreach-channel.md). */
const COUNTRY_ZONE: Readonly<Record<string, string>> = {
  NG: "Africa/Lagos",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  BE: "Europe/Brussels",
  AT: "Europe/Vienna",
  ZA: "Africa/Johannesburg",
  GH: "Africa/Accra",
  KE: "Africa/Nairobi",
  AE: "Asia/Dubai",
};

/** Multi-zone countries: a small city map, then the capital's zone as the fallback. */
const MULTI_ZONE: Readonly<Record<string, { capital: string; cities: Readonly<Record<string, string>> }>> = {
  US: {
    capital: "America/New_York",
    cities: {
      "new york": "America/New_York",
      chicago: "America/Chicago",
      houston: "America/Chicago",
      dallas: "America/Chicago",
      denver: "America/Denver",
      phoenix: "America/Phoenix",
      "los angeles": "America/Los_Angeles",
      "san francisco": "America/Los_Angeles",
      seattle: "America/Los_Angeles",
    },
  },
  CA: {
    capital: "America/Toronto",
    cities: {
      toronto: "America/Toronto",
      ottawa: "America/Toronto",
      montreal: "America/Toronto",
      winnipeg: "America/Winnipeg",
      calgary: "America/Edmonton",
      edmonton: "America/Edmonton",
      vancouver: "America/Vancouver",
    },
  },
  AU: {
    capital: "Australia/Sydney",
    cities: {
      sydney: "Australia/Sydney",
      melbourne: "Australia/Melbourne",
      brisbane: "Australia/Brisbane",
      perth: "Australia/Perth",
      adelaide: "Australia/Adelaide",
    },
  },
};

function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const resolveRecipientTimezone: ResolveRecipientTimezone = ({ country, city }) => {
  const cc = (country ?? "").trim().toUpperCase();
  if (cc === "") return "Etc/UTC";

  const multi = MULTI_ZONE[cc];
  if (multi !== undefined) {
    const key = (city ?? "").trim().toLowerCase();
    const byCity = multi.cities[key];
    return byCity ?? multi.capital;
  }

  const single = COUNTRY_ZONE[cc];
  if (single !== undefined) return single;

  return "Etc/UTC";
};

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (f === undefined) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

function localParts(tz: string, date: Date): LocalParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: string): number => {
    const v = parts.find((p) => p.type === type)?.value ?? "0";
    return Number.parseInt(v, 10);
  };
  // Intl may render midnight as "24"; normalise to 0.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") };
}

/** Milliseconds to add to a UTC instant to get the wall clock in `tz` (local − UTC). */
function offsetMs(tz: string, date: Date): number {
  const p = localParts(tz, date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** The UTC instant for a wall-clock time in `tz` (DST-safe via a one-step offset refinement). */
function zonedWallToUtc(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  let utc = guess - offsetMs(tz, new Date(guess));
  utc = guess - offsetMs(tz, new Date(utc));
  return new Date(utc);
}

/** ISO weekday (Mon=1 … Sun=7) for the local calendar date in `tz`. */
function isoWeekday(tz: string, date: Date): number {
  const p = localParts(tz, date);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

function hm(value: string): { h: number; m: number } {
  const [h, m] = value.split(":");
  return { h: Number.parseInt(h ?? "0", 10), m: Number.parseInt(m ?? "0", 10) };
}

/**
 * The next allowed send instant at or after `from`, inside the window. Jitter (0..jitterMinutes) is
 * added to the window start; `rng` defaults to Math.random but is injectable for tests.
 */
export const nextSendSlot: NextSendSlot = (window, from, rng = Math.random) => {
  const tz = window.timezone;
  const start = hm(window.start);
  const end = hm(window.end);
  const jitter = Math.floor(rng() * (window.jitterMinutes + 1)) * MINUTE_MS;

  // Look ahead up to 14 local days to find the next in-window slot.
  for (let i = 0; i < 14; i += 1) {
    const probe = new Date(from.getTime() + i * DAY_MS);
    const p = localParts(tz, probe);
    if (!window.days.includes(isoWeekday(tz, probe))) continue;

    const windowStart = zonedWallToUtc(tz, p.year, p.month, p.day, start.h, start.m);
    const windowEnd = zonedWallToUtc(tz, p.year, p.month, p.day, end.h, end.m);
    const jitteredStart = new Date(windowStart.getTime() + jitter);

    if (from.getTime() <= jitteredStart.getTime()) {
      if (jitteredStart.getTime() < windowEnd.getTime()) return jitteredStart;
      continue; // jitter pushed us past the window end; try the next day
    }
    if (from.getTime() < windowEnd.getTime()) return from; // already inside today's window
  }
  // Degenerate configuration (e.g. no send days): fall back to `from` rather than loop forever.
  return from;
};

/** Add `n` business days (Mon–Fri) to a UTC instant, counted in the recipient's timezone. */
export function addBusinessDays(tz: string, from: Date, n: number): Date {
  if (n <= 0) return from;
  let remaining = n;
  let cursor = from;
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + DAY_MS);
    if (isoWeekday(tz, cursor) <= 5) remaining -= 1;
  }
  return cursor;
}

/** Builds a {@link SendWindow} for a recipient from the resolved timezone and the configured hours. */
export function buildSendWindow(input: {
  timezone: string;
  start: string;
  end: string;
  jitterMinutes: number;
}): SendWindow {
  return {
    timezone: isValidZone(input.timezone) ? input.timezone : "Etc/UTC",
    days: [1, 2, 3, 4, 5],
    start: input.start,
    end: input.end,
    jitterMinutes: input.jitterMinutes,
  };
}
