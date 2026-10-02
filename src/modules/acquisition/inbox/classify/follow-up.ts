/**
 * Resolves the nurture follow-up instant for a NOT_NOW reply (module spec §3.12). The classifier
 * returns an ISO date already resolved from phrases ("next quarter", "after Easter"); here we place
 * it at local noon in the recipient's timezone, roll a past date forward by the default horizon, and
 * fall back to +defaultDays when no date was extracted. Time is injected, never read from the clock.
 */

import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveFollowUpDate(
  isoDate: string | null,
  now: Date,
  timezone: string,
  defaultDays: number,
): Date {
  if (isoDate === null || !ISO_DATE.test(isoDate)) {
    return addDays(now, defaultDays);
  }
  let instant: Date;
  try {
    instant = fromZonedTime(`${isoDate}T12:00:00`, timezone);
  } catch {
    return addDays(now, defaultDays);
  }
  if (Number.isNaN(instant.getTime())) return addDays(now, defaultDays);
  // A date in the past (the model resolved a stale phrase) rolls forward by the default horizon.
  if (instant.getTime() <= now.getTime()) return addDays(now, defaultDays);
  return instant;
}
