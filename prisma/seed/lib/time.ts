/**
 * Relative timestamps (data-model §10.1): "sent 3 days ago" is computed from the run's fixed
 * `now`, so SLAs, reminders and nurture dates are always meaningful whenever the seed runs.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface Offset {
  days?: number;
  hours?: number;
  minutes?: number;
}

function ms({ days = 0, hours = 0, minutes = 0 }: Offset): number {
  return days * DAY + hours * HOUR + minutes * MINUTE;
}

export function ago(now: Date, offset: Offset): Date {
  return new Date(now.getTime() - ms(offset));
}

export function fromNow(now: Date, offset: Offset): Date {
  return new Date(now.getTime() + ms(offset));
}

/** The UTC calendar day (a @db.Date value) `days` before `now`. */
export function dayOf(now: Date, daysBack = 0): Date {
  const date = new Date(now.getTime() - daysBack * DAY);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
