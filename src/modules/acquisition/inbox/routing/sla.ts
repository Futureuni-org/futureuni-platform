/**
 * Business-hours SLA maths (module spec §3.12). An actionable reply must get a first human response
 * within N business hours, counted only during the owner's working days and hours in their
 * timezone. Time is always injected (INV-12): `computeSlaDueAt` takes the start instant and the
 * owner's working pattern and returns the due instant in UTC.
 */

import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { ReplyClass } from "@/contracts/common";

export interface WorkingPattern {
  timezone: string;
  /** Working weekdays; ISO (1=Mon … 7=Sun) or 0..6 (0=Sun) are both accepted. */
  workingDays: number[];
  workingHoursStart: string; // "HH:MM"
  workingHoursEnd: string; // "HH:MM"
}

const ACTIONABLE: ReadonlySet<ReplyClass> = new Set<ReplyClass>([
  "INTERESTED",
  "QUESTION",
  "OBJECTION_PRICE",
  "OBJECTION_OTHER",
]);

/** Whether a reply class carries a first-response SLA. */
export function isActionable(classification: ReplyClass): boolean {
  return ACTIONABLE.has(classification);
}

function parseHM(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

function isWorkingDay(isoDow: number, workingDays: number[]): boolean {
  const days = workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5];
  return days.includes(isoDow) || (isoDow === 7 && days.includes(0));
}

function wall(instant: Date, tz: string): { ymd: string; minuteOfDay: number; isoDow: number } {
  const ymd = formatInTimeZone(instant, tz, "yyyy-MM-dd");
  const hm = formatInTimeZone(instant, tz, "HH:mm");
  const isoDow = Number(formatInTimeZone(instant, tz, "i"));
  return { ymd, minuteOfDay: parseHM(hm), isoDow };
}

function atWall(ymd: string, minuteOfDay: number, tz: string): Date {
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return fromZonedTime(`${ymd}T${hh}:${mm}:00`, tz);
}

function nextDayYmd(ymd: string, tz: string): string {
  const noon = fromZonedTime(`${ymd}T12:00:00`, tz);
  return formatInTimeZone(addDays(noon, 1), tz, "yyyy-MM-dd");
}

/** Returns the instant by which the SLA is due, accruing only business minutes. */
export function computeSlaDueAt(start: Date, businessHours: number, pattern: WorkingPattern): Date {
  const startMin = parseHM(pattern.workingHoursStart);
  const endMin = parseHM(pattern.workingHoursEnd);
  let remaining = Math.max(0, Math.round(businessHours * 60));
  if (remaining === 0 || endMin <= startMin) return start;

  let { ymd, minuteOfDay, isoDow } = wall(start, pattern.timezone);

  for (let guard = 0; guard < 400; guard++) {
    if (!isWorkingDay(isoDow, pattern.workingDays) || minuteOfDay >= endMin) {
      ymd = nextDayYmd(ymd, pattern.timezone);
      const next = wall(atWall(ymd, 0, pattern.timezone), pattern.timezone);
      ymd = next.ymd;
      isoDow = next.isoDow;
      minuteOfDay = 0;
      continue;
    }
    const effectiveStart = Math.max(minuteOfDay, startMin);
    const availableToday = endMin - effectiveStart;
    if (remaining <= availableToday) {
      return atWall(ymd, effectiveStart + remaining, pattern.timezone);
    }
    remaining -= availableToday;
    ymd = nextDayYmd(ymd, pattern.timezone);
    const next = wall(atWall(ymd, 0, pattern.timezone), pattern.timezone);
    ymd = next.ymd;
    isoDow = next.isoDow;
    minuteOfDay = 0;
  }
  // Pathological pattern (no working time found): fall back to a wall-clock offset.
  return new Date(start.getTime() + businessHours * 3_600_000);
}
