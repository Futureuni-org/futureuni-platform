import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { LeadStatus, Market } from "@/contracts/common";

/**
 * Client-safe filter model for the leads list (no DB, no server-only imports): the URL param names,
 * the grouped-status map, the flag set, and a pure parser. The repo (`leads-list.repo.ts`) turns a
 * parsed `LeadListFilter` into a Prisma `where`. Both the server page and the client filter bar
 * import from here so the param contract stays in one place (B3.8: filters live in the URL).
 */

/** Grouped statuses the FilterBar offers (project spec §leads list). */
export const STATUS_GROUPS = {
  sourcing: {
    label: "New → audited",
    statuses: ["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED"],
  },
  review: { label: "In review", statuses: ["SCORED", "IN_REVIEW", "APPROVED"] },
  contacted: { label: "Contacted", statuses: ["CONTACTED"] },
  replied: { label: "Replied", statuses: ["REPLIED"] },
  pipeline: { label: "Pipeline", statuses: ["MEETING_BOOKED", "PROPOSAL_SENT"] },
  nurture: { label: "Nurture", statuses: ["NURTURE"] },
  closed: { label: "Closed", statuses: ["WON", "LOST", "DISQUALIFIED", "SUPPRESSED"] },
  // Not shown in the dropdown, but accepted from built-in views.
  enriching: { label: "Enriching", statuses: ["ENRICHING"] },
} as const satisfies Record<string, { label: string; statuses: LeadStatus[] }>;

export type StatusGroupKey = keyof typeof STATUS_GROUPS;

/** The groups the dropdown shows, in order (the off-menu group is excluded). */
export const STATUS_GROUP_OPTIONS: { value: StatusGroupKey; label: string }[] = (
  ["sourcing", "review", "contacted", "replied", "pipeline", "nurture", "closed"] as const
).map((value) => ({ value, label: STATUS_GROUPS[value].label }));

export const LEAD_FLAGS = {
  needsReview: "Needs review",
  compliance: "Compliance review",
  crossSell: "Cross-sell",
} as const;
export type LeadFlagKey = keyof typeof LEAD_FLAGS;

/** Which timestamp the date range applies to. "activity" is the lead's last real activity. */
export type LeadDateField = "created" | "updated" | "activity";
const DATE_FIELDS: readonly LeadDateField[] = ["created", "updated", "activity"];

/** Every URL param the leads list understands. A saved view may hold these and nothing else. */
export const LEAD_FILTER_KEYS = [
  "q",
  "group",
  "market",
  "country",
  "scoreMin",
  "scoreMax",
  "owner",
  "source",
  "signal",
  "flags",
  "dateField",
  "from",
  "to",
  "nextFrom",
  "nextTo",
] as const;

/** The longest search text accepted; anything longer is cut, not rejected. */
export const MAX_SEARCH_LENGTH = 100;

/**
 * A day range is half-open: `from` is the start of the first day and `toExclusive` the start of the
 * day after the last one, both in the viewer's timezone. A plain `<= to` would stop at 00:00 on the
 * last day and drop everything that happened during it.
 */
export interface LeadListFilter {
  q?: string | undefined;
  group?: StatusGroupKey | undefined;
  market?: Market | undefined;
  country?: string | undefined;
  scoreMin?: number | undefined;
  scoreMax?: number | undefined;
  ownerId?: string | undefined;
  source?: string | undefined;
  signalType?: string | undefined;
  flags: LeadFlagKey[];
  dateField: LeadDateField;
  from?: Date | undefined;
  toExclusive?: Date | undefined;
  /** Next-action window, used only by the "nurture due" built-in view. */
  nextFrom?: Date | undefined;
  nextToExclusive?: Date | undefined;
}

const MARKETS: readonly Market[] = ["NIGERIA", "INTERNATIONAL"];

function one(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

function intInRange(raw: string | undefined, min: number, max: number): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(n, min), max);
}

/**
 * A calendar day ("2026-10-03") moved by `days`, or undefined when it isn't a real date. The
 * arithmetic is on the calendar, in UTC: adding 24 hours to a local midnight lands on the same day
 * when the clocks go back, and on the day after next when they go forward.
 */
function shiftDay(day: string, days: number): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) return undefined;
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  // An impossible date such as 2026-13-45 would roll over to a real one; refuse it instead.
  if (Number.isNaN(base.getTime()) || base.toISOString().slice(0, 10) !== day) return undefined;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** The instant a calendar day ("2026-10-03") starts in `timezone`, optionally `plusDays` later. */
function dayStart(raw: string | undefined, timezone: string, plusDays = 0): Date | undefined {
  if (raw === undefined) return undefined;
  const day = shiftDay(raw, plusDays);
  if (day === undefined) return undefined;
  try {
    const start = fromZonedTime(`${day}T00:00:00`, timezone);
    return Number.isNaN(start.getTime()) ? undefined : start;
  } catch {
    return undefined;
  }
}

/**
 * Parse the raw searchParams into a typed, validated filter. Dates are calendar days in the
 * viewer's `timezone` (INV-12).
 */
export function parseLeadFilters(
  sp: Record<string, string | string[] | undefined>,
  timezone: string,
): LeadListFilter {
  const groupRaw = one(sp.group);
  const group =
    groupRaw !== undefined && Object.hasOwn(STATUS_GROUPS, groupRaw)
      ? (groupRaw as StatusGroupKey)
      : undefined;

  const marketRaw = one(sp.market);
  const market = MARKETS.find((m) => m === marketRaw);

  const flagsRaw = (Array.isArray(sp.flags) ? sp.flags : one(sp.flags)?.split(",")) ?? [];
  const flags = (Object.keys(LEAD_FLAGS) as LeadFlagKey[]).filter((f) => flagsRaw.includes(f));

  const dateField = DATE_FIELDS.find((field) => field === one(sp.dateField)) ?? "created";
  const search = one(sp.q)?.trim().slice(0, MAX_SEARCH_LENGTH);

  return {
    q: search === undefined || search === "" ? undefined : search,
    group,
    market,
    country: one(sp.country),
    scoreMin: intInRange(one(sp.scoreMin), 0, 100),
    scoreMax: intInRange(one(sp.scoreMax), 0, 100),
    ownerId: one(sp.owner),
    source: one(sp.source),
    signalType: one(sp.signal),
    flags,
    dateField,
    from: dayStart(one(sp.from), timezone),
    toExclusive: dayStart(one(sp.to), timezone, 1),
    nextFrom: dayStart(one(sp.nextFrom), timezone),
    nextToExclusive: dayStart(one(sp.nextTo), timezone, 1),
  };
}

export interface BuiltinView {
  id: string;
  label: string;
  /** Built on the server (resolves the current user id and the current date). */
  query: Record<string, string>;
}

/**
 * Built-in saved views, resolved server-side so "my leads" and the dates are concrete links. Dates
 * are calendar days in the viewer's timezone.
 */
export function builtinViews(userId: string, now: Date, timezone: string): BuiltinView[] {
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const day = (offset: number) => shiftDay(today, offset) ?? today;
  return [
    { id: "my", label: "My leads", query: { owner: userId } },
    {
      id: "hot",
      label: "Hot (replied, last 7 days)",
      // Last activity, not "updated": a nightly job touching the row must not make a lead look hot.
      query: { group: "replied", dateField: "activity", from: day(-7) },
    },
    { id: "stuck", label: "Stuck in enrichment", query: { group: "enriching" } },
    {
      id: "nurture_due",
      label: "Nurture due this week",
      query: { group: "nurture", nextTo: day(7) },
    },
  ];
}

export { MARKETS };
