import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { LegalForm, LostReason, ServiceLine } from "@/contracts/common";

export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "Web Development",
  UI_UX_DESIGN: "UI/UX Design",
  GRAPHIC_DESIGN: "Graphic Design",
  VIDEO_EDITING: "Video Editing",
};

/** The fixed list of lost reasons, in the order the dialog offers them. */
export const LOST_REASON_LABEL: Record<LostReason, string> = {
  PRICE: "Price",
  TIMING: "Timing",
  NO_RESPONSE: "No response",
  CHOSE_COMPETITOR: "Chose a competitor",
  IN_HOUSE: "Doing it in-house",
  NOT_A_FIT: "Not a fit",
  SCOPE_CHANGED: "Scope changed",
  OTHER: "Other",
};

/**
 * Display helpers shared by the Phase 16 screens (project-rules §"Output/document rules"):
 * dates as `25 Sep 2026`, date-times as `25 Sep 2026, 14:30 WAT`, in the viewer's timezone.
 */

export function formatDate(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "d MMM yyyy");
}

/**
 * A date-only value (a proposal's valid-until date, a deal's start date, a reply's follow-up date).
 * These are stored without a time and come back as midnight UTC, so they are formatted in UTC: in
 * the viewer's timezone a date west of Greenwich would show as the day before.
 */
export function formatDay(iso: string): string {
  return formatInTimeZone(new Date(iso), "UTC", "d MMM yyyy");
}

// The locales to ask for a timezone's short name, in order. Which names a locale knows varies:
// "en-US" calls Lagos time "GMT+1" where "en-NG" says "WAT". The list is fixed, and never the
// runtime's own locale, so the server and the browser render the same text.
const ABBREVIATION_LOCALES = ["en-NG", "en-GB", "en-US"] as const;
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(locale: string, timezone: string): Intl.DateTimeFormat {
  const key = `${locale}|${timezone}`;
  let formatter = zoneFormatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone: timezone, timeZoneName: "short" });
    zoneFormatters.set(key, formatter);
  }
  return formatter;
}

/** The timezone's short name at `date` ("WAT", "BST"), or its offset ("GMT+1") when it has none. */
function zoneAbbreviation(date: Date, timezone: string): string {
  let offset = "";
  for (const locale of ABBREVIATION_LOCALES) {
    const name = zoneFormatter(locale, timezone)
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value;
    if (name === undefined) continue;
    if (!/^(?:GMT|UTC)./.test(name)) return name;
    if (offset === "") offset = name;
  }
  return offset;
}

export function formatDateTime(iso: string, timezone: string): string {
  const date = new Date(iso);
  const abbreviation = zoneAbbreviation(date, timezone);
  const text = formatInTimeZone(date, timezone, "d MMM yyyy, HH:mm");
  return abbreviation === "" ? text : `${text} ${abbreviation}`;
}

/** "MEETING_BOOKED" → "Meeting booked": a sentence-case label for an enum value. */
export function enumLabel(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Legal forms carry abbreviations a sentence-case label would mangle ("Llc", "Ngo"). */
export const LEGAL_FORM_LABEL: Record<LegalForm, string> = {
  LIMITED: "Limited company",
  PLC: "Public limited company (PLC)",
  LLP: "Limited liability partnership (LLP)",
  SOLE_TRADER: "Sole trader",
  PARTNERSHIP: "Partnership",
  NG_REGISTERED_COMPANY: "Registered company (Nigeria)",
  NG_BUSINESS_NAME: "Business name (Nigeria)",
  CORPORATION: "Corporation",
  LLC: "Limited liability company (LLC)",
  NON_PROFIT: "Non-profit",
  PUBLIC_BODY: "Public body",
  OTHER: "Other",
  UNKNOWN: "Unknown",
};

const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

/** A 0–1 confidence as a whole percentage ("82%"). */
export function formatConfidence(value: number): string {
  return PERCENT.format(value);
}

/**
 * `<input type="datetime-local">` value → ISO-8601 UTC, or null when it can't be parsed. The value
 * is a wall-clock time with no zone. It is read in the viewer's profile `timezone`, the same one
 * every date on the screen is shown in, not the browser's: someone travelling who types 14:30
 * otherwise saves a time that then displays as something else.
 */
export function localInputToIso(value: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)) return null;
  try {
    const date = fromZonedTime(value, timezone);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

/** ISO-8601 → the `<input type="datetime-local">` value for that instant in `timezone`. */
export function isoToLocalInput(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "yyyy-MM-dd'T'HH:mm");
}

/**
 * `<input type="date">` value ("2026-10-03") → ISO-8601 UTC midnight, or null. For values stored
 * as a date with no time; pair it with `formatDay`.
 */
export function dateInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO-8601 of a date-only value → the `<input type="date">` value. */
export function isoToDateInput(iso: string): string {
  return formatInTimeZone(new Date(iso), "UTC", "yyyy-MM-dd");
}
