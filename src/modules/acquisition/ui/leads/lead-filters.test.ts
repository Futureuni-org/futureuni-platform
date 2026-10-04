import { describe, expect, it } from "vitest";

import { builtinViews, MAX_SEARCH_LENGTH, parseLeadFilters, STATUS_GROUPS } from "./lead-filters";

const LAGOS = "Africa/Lagos"; // UTC+1, no daylight saving
const LONDON = "Europe/London";

describe("parseLeadFilters", () => {
  it("defaults to no filters with the created date field", () => {
    const f = parseLeadFilters({}, LAGOS);
    expect(f.q).toBeUndefined();
    expect(f.group).toBeUndefined();
    expect(f.flags).toEqual([]);
    expect(f.dateField).toBe("created");
    expect(f.from).toBeUndefined();
    expect(f.toExclusive).toBeUndefined();
  });

  it("keeps a known status group and drops an unknown one", () => {
    expect(parseLeadFilters({ group: "replied" }, LAGOS).group).toBe("replied");
    expect(parseLeadFilters({ group: "banana" }, LAGOS).group).toBeUndefined();
  });

  it("does not resolve a group name that is only an inherited object property", () => {
    expect(parseLeadFilters({ group: "constructor" }, LAGOS).group).toBeUndefined();
    expect(parseLeadFilters({ group: "__proto__" }, LAGOS).group).toBeUndefined();
  });

  it("validates the market enum", () => {
    expect(parseLeadFilters({ market: "NIGERIA" }, LAGOS).market).toBe("NIGERIA");
    expect(parseLeadFilters({ market: "MARS" }, LAGOS).market).toBeUndefined();
  });

  it("clamps the score range to 0–100", () => {
    const f = parseLeadFilters({ scoreMin: "-5", scoreMax: "250" }, LAGOS);
    expect(f.scoreMin).toBe(0);
    expect(f.scoreMax).toBe(100);
  });

  it("parses a comma-separated flag list, ignoring unknown flags", () => {
    const f = parseLeadFilters({ flags: "needsReview,bogus,crossSell" }, LAGOS);
    expect(f.flags).toEqual(["needsReview", "crossSell"]);
  });

  it("trims the search text and cuts it at the maximum length", () => {
    expect(parseLeadFilters({ q: "  acme  " }, LAGOS).q).toBe("acme");
    expect(parseLeadFilters({ q: "   " }, LAGOS).q).toBeUndefined();
    expect(parseLeadFilters({ q: "x".repeat(500) }, LAGOS).q).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("reads the date field, defaulting an unknown one to created", () => {
    expect(parseLeadFilters({ dateField: "updated" }, LAGOS).dateField).toBe("updated");
    expect(parseLeadFilters({ dateField: "activity" }, LAGOS).dateField).toBe("activity");
    expect(parseLeadFilters({ dateField: "bogus" }, LAGOS).dateField).toBe("created");
  });

  it("starts a day at midnight in the viewer's timezone, not in UTC", () => {
    const f = parseLeadFilters({ from: "2026-10-03" }, LAGOS);
    // Midnight in Lagos is 23:00 UTC the day before.
    expect(f.from?.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });

  it("includes the whole of the last day: the end is the start of the next day", () => {
    const f = parseLeadFilters({ from: "2026-10-03", to: "2026-10-03" }, LAGOS);
    expect(f.from?.toISOString()).toBe("2026-10-02T23:00:00.000Z");
    expect(f.toExclusive?.toISOString()).toBe("2026-10-03T23:00:00.000Z");
  });

  it("keeps the day boundary at local midnight across a daylight-saving change", () => {
    // UK clocks go back on 25 Oct 2026, so that day is 25 hours long.
    const f = parseLeadFilters({ from: "2026-10-25", to: "2026-10-25" }, LONDON);
    expect(f.from?.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(f.toExclusive?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("applies the same day rule to the next-action window", () => {
    const f = parseLeadFilters({ nextFrom: "2026-10-03", nextTo: "2026-10-10" }, LAGOS);
    expect(f.nextFrom?.toISOString()).toBe("2026-10-02T23:00:00.000Z");
    expect(f.nextToExclusive?.toISOString()).toBe("2026-10-10T23:00:00.000Z");
  });

  it("ignores an unparseable date", () => {
    expect(parseLeadFilters({ from: "not-a-date" }, LAGOS).from).toBeUndefined();
    expect(parseLeadFilters({ to: "2026-13-45" }, LAGOS).toExclusive).toBeUndefined();
  });
});

describe("builtinViews", () => {
  it("resolves 'my leads' to the current user and builds concrete date presets", () => {
    const views = builtinViews("user_123", new Date("2026-10-03T12:00:00Z"), LAGOS);
    const my = views.find((v) => v.id === "my");
    expect(my?.query.owner).toBe("user_123");
    const hot = views.find((v) => v.id === "hot");
    expect(hot?.query.group).toBe("replied");
    expect(hot?.query.dateField).toBe("activity");
    expect(hot?.query.from).toBe("2026-09-26");
    expect(views.map((v) => v.id)).toEqual(["my", "hot", "stuck", "nurture_due"]);
  });

  it("takes 'today' from the viewer's timezone", () => {
    // 23:30 UTC on 3 Oct is already 4 Oct in Lagos.
    const views = builtinViews("user_123", new Date("2026-10-03T23:30:00Z"), LAGOS);
    expect(views.find((v) => v.id === "hot")?.query.from).toBe("2026-09-27");
    expect(views.find((v) => v.id === "nurture_due")?.query.nextTo).toBe("2026-10-11");
  });
});

describe("STATUS_GROUPS", () => {
  it("maps 'closed' to the terminal statuses", () => {
    expect(STATUS_GROUPS.closed.statuses).toEqual(["WON", "LOST", "DISQUALIFIED", "SUPPRESSED"]);
  });
});
