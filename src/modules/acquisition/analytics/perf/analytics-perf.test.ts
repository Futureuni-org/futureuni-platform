/**
 * Performance budget for the analytics data layer (Phase 17, M17-AC3): generate ~50,000 leads with
 * realistic funnel, source, reply, meeting and revenue distributions, then assert every analytics
 * query returns under 800ms at p95 locally. Test-only and local-only (guarded by
 * `assertTestDatabase`), and skipped unless `PERF=1`, so it never runs in CI. The data is committed
 * (the services read the root `db`, not a test transaction) and removed in `afterAll`.
 *
 * Run it with:  PERF=1 pnpm exec vitest run src/modules/acquisition/analytics/perf
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor, Currency, LeadStatus, Market, ServiceLine } from "@/contracts/common";
import { db } from "@/platform/db";
import { assertTestDatabase } from "../../../../../tests/factories/test-db";

import {
  getBreakdown,
  getFunnel,
  getLineAnalytics,
  getOverview,
  getReplyHeatmap,
  getTimeSeries,
  type LineAnalyticsFilters,
} from "../index";

const RUN = process.env.PERF === "1";
const LEADS = Number(process.env.PERF_LEADS ?? "50000");
const MARKER = "perf-17";
/** Rows per createMany, kept well under Postgres's 65535 bind-parameter limit. */
const CHUNK = 1_000;
const P95_BUDGET_MS = 800;

const LINES: ServiceLine[] = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"];
const ADAPTERS = ["google-places", "serpapi", "adzuna", "companies-house"];
const INTL_CURRENCIES: Currency[] = ["USD", "GBP", "EUR"];
/** Main funnel path; a lead's reach rank is its index + 1. */
const MAIN: LeadStatus[] = [
  "NEW",
  "ENRICHED",
  "AUDITED",
  "SCORED",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
  "WON",
];

let ADMIN_ID = "";
let idCounter = 0;
function pid(): string {
  idCounter += 1;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-03T09:00:00.000Z");
const WINDOW_DAYS = 60;

/** Deterministic pseudo-random in [0,1) so the dataset reproduces run to run. */
let seed = 20_260_925;
function rnd(): number {
  seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

function createdAt(): Date {
  return new Date(NOW.getTime() - Math.floor(rnd() * WINDOW_DAYS) * DAY_MS);
}

/** Reach rank 1..10 with a funnel-shaped falloff. */
function reachRank(): number {
  const r = rnd();
  if (r < 0.1) return 1;
  if (r < 0.2) return 2;
  if (r < 0.3) return 3;
  if (r < 0.45) return 4;
  if (r < 0.5) return 5;
  if (r < 0.72) return 6;
  if (r < 0.84) return 7;
  if (r < 0.92) return 8;
  if (r < 0.97) return 9;
  return 10;
}

interface Chunked<T> {
  rows: T[];
  push: (row: T) => Promise<void>;
  flush: () => Promise<void>;
}

function chunker<T>(insert: (rows: T[]) => Promise<unknown>): Chunked<T> {
  const buffer: T[] = [];
  // No auto-flush: buffers are flushed at the end in dependency order (companies → leads →
  // children), so a child row never inserts before its parent. Each flush sub-chunks under the
  // bind-parameter limit.
  const flush = async (): Promise<void> => {
    while (buffer.length > 0) await insert(buffer.splice(0, CHUNK));
  };
  return {
    rows: buffer,
    push: (row) => {
      buffer.push(row);
      return Promise.resolve();
    },
    flush,
  };
}

async function generate(): Promise<void> {
  const companies = chunker<Record<string, unknown>>((rows) => db.company.createMany({ data: rows as never }));
  const leads = chunker<Record<string, unknown>>((rows) => db.lead.createMany({ data: rows as never }));
  const events = chunker<Record<string, unknown>>((rows) => db.leadEvent.createMany({ data: rows as never }));
  const signals = chunker<Record<string, unknown>>((rows) => db.signal.createMany({ data: rows as never }));
  const messages = chunker<Record<string, unknown>>((rows) => db.message.createMany({ data: rows as never }));
  const replies = chunker<Record<string, unknown>>((rows) => db.reply.createMany({ data: rows as never }));
  const meetings = chunker<Record<string, unknown>>((rows) => db.meeting.createMany({ data: rows as never }));
  const deals = chunker<Record<string, unknown>>((rows) => db.deal.createMany({ data: rows as never }));
  const aiCalls = chunker<Record<string, unknown>>((rows) => db.aiCall.createMany({ data: rows as never }));

  for (let i = 0; i < LEADS; i += 1) {
    const companyId = pid();
    const leadId = pid();
    const line = LINES[i % LINES.length] ?? "WEB_DEVELOPMENT";
    const isNg = rnd() < 0.6;
    const market: Market = isNg ? "NIGERIA" : "INTERNATIONAL";
    const country = isNg ? "NG" : "GB";
    const created = createdAt();
    const rank = reachRank();
    // A fraction of far-reaching leads are lost rather than their main status.
    const lost = rank >= 6 && rnd() < 0.15;
    const status: LeadStatus = lost ? "LOST" : (MAIN[rank - 1] ?? "NEW");
    const contacted = rank >= 6;
    const scored = rank >= 4;

    await companies.push({
      id: companyId,
      name: `Perf ${String(i)}`,
      normalizedName: `perf ${String(i)}`,
      normalizedDomain: `perf-${String(i)}.example`,
      country,
      city: isNg ? "Lagos" : "London",
      market,
      firstSource: MARKER,
    });
    await leads.push({
      id: leadId,
      companyId,
      serviceLine: line,
      market,
      country,
      status,
      createdAt: created,
      lastActivityAt: created,
      ...(scored ? { score: 40 + Math.floor(rnd() * 60), scoreBand: "QUALIFIED", scoredAt: created } : {}),
      ...(contacted ? { firstContactedAt: new Date(created.getTime() + DAY_MS) } : {}),
      ...(status === "WON" || lost ? { closedAt: new Date(created.getTime() + 20 * DAY_MS) } : {}),
    });

    // Funnel reach events for every main stage up to the lead's rank.
    for (let r = 0; r < Math.min(rank, MAIN.length); r += 1) {
      await events.push({
        id: pid(),
        leadId,
        kind: "STATUS_CHANGE",
        fromStatus: r === 0 ? null : MAIN[r - 1],
        toStatus: MAIN[r],
        actorType: "SYSTEM",
        actorLabel: MARKER,
        createdAt: new Date(created.getTime() + r * 3_600_000),
      });
    }

    await signals.push({
      id: pid(),
      companyId,
      leadId,
      serviceLine: line,
      signalType: rnd() < 0.5 ? "no_website" : "slow_site",
      evidenceText: "perf",
      sourceUrl: `https://maps.example.com/perf/${String(i)}`,
      adapterId: ADAPTERS[i % ADAPTERS.length] ?? "google-places",
      observedAt: created,
      createdAt: created,
    });

    await aiCalls.push({
      id: pid(),
      task: rnd() < 0.5 ? "acquisition.score-lead-brief" : "acquisition.outreach-draft",
      model: "mock",
      provider: "mock",
      actorType: "SYSTEM",
      module: MARKER,
      leadId,
      costMicros: 500 + Math.floor(rnd() * 4_000),
      outcome: "OK",
      createdAt: created,
    });

    if (contacted) {
      const sentAt = new Date(created.getTime() + DAY_MS);
      await messages.push({
        id: pid(),
        leadId,
        companyId,
        kind: "SEQUENCE",
        channel: "EMAIL",
        status: "SENT",
        stepIndex: 0,
        body: "perf",
        sentAt,
        createdAt: sentAt,
      });
    }
    if (rank >= 7 || (lost && rank >= 6)) {
      const receivedAt = new Date(created.getTime() + 2 * DAY_MS);
      await replies.push({
        id: pid(),
        leadId,
        companyId,
        channel: "EMAIL",
        receivedAt,
        latestText: "perf",
        matchMethod: "THREAD_ID",
        classification: rnd() < 0.6 ? "INTERESTED" : "QUESTION",
        slaStatus: rnd() < 0.8 ? "MET" : "BREACHED",
        firstResponseAt: new Date(receivedAt.getTime() + 2 * 3_600_000),
        createdAt: receivedAt,
      });
    }
    if (rank >= 8) {
      const startsAt = new Date(created.getTime() + 5 * DAY_MS);
      await meetings.push({
        id: pid(),
        leadId,
        companyId,
        source: "MANUAL",
        status: rnd() < 0.8 ? "HELD" : "NO_SHOW",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 1_800_000),
        timezone: "Africa/Lagos",
        createdAt: startsAt,
      });
    }
    if (status === "WON") {
      const closedAt = new Date(created.getTime() + 20 * DAY_MS);
      const currency: Currency = isNg ? "NGN" : (INTL_CURRENCIES[i % INTL_CURRENCIES.length] ?? "USD");
      await deals.push({
        id: pid(),
        leadId,
        companyId,
        serviceLine: line,
        market,
        outcome: "WON",
        valueMinor: (isNg ? 500_000 : 400_000) + Math.floor(rnd() * 1_000_000),
        currency,
        closedById: ADMIN_ID,
        closedAt,
        createdAt: closedAt,
      });
    } else if (lost) {
      const closedAt = new Date(created.getTime() + 20 * DAY_MS);
      await deals.push({
        id: pid(),
        leadId,
        companyId,
        serviceLine: line,
        market,
        outcome: "LOST",
        lostReason: rnd() < 0.5 ? "PRICE" : "TIMING",
        closedById: ADMIN_ID,
        closedAt,
        createdAt: closedAt,
      });
    }
  }

  for (const c of [companies, leads, events, signals, aiCalls, messages, replies, meetings, deals]) {
    await c.flush();
  }
}

async function cleanup(): Promise<void> {
  await db.aiCall.deleteMany({ where: { module: MARKER } });
  const byCompany = { lead: { company: { firstSource: MARKER } } } as const;
  await db.deal.deleteMany({ where: byCompany });
  await db.meeting.deleteMany({ where: byCompany });
  await db.reply.deleteMany({ where: byCompany });
  await db.message.deleteMany({ where: byCompany });
  await db.signal.deleteMany({ where: { company: { firstSource: MARKER } } });
  await db.lead.deleteMany({ where: { company: { firstSource: MARKER } } });
  await db.company.deleteMany({ where: { firstSource: MARKER } });
  if (ADMIN_ID !== "") await db.user.deleteMany({ where: { id: ADMIN_ID } });
}

async function p95(label: string, fn: () => Promise<unknown>, runs = 15): Promise<number> {
  const timings: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const value = timings[Math.min(timings.length - 1, Math.floor(0.95 * timings.length))] ?? 0;
  console.warn(`perf ${label}: p95 ${value.toFixed(0)}ms over ${String(runs)} runs`);
  return value;
}

describe.skipIf(!RUN)("analytics performance budget (50k leads)", () => {
  let actor: Actor;
  let filters: LineAnalyticsFilters;

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await db.user.create({
      data: { id: pid(), name: "Perf Admin", email: `perf-admin-${pid()}@example.test`, role: "ADMIN", status: "ACTIVE" },
    });
    ADMIN_ID = admin.id;
    actor = { type: "USER", userId: admin.id, role: "ADMIN" };
    filters = {
      serviceLine: "WEB_DEVELOPMENT",
      from: new Date(NOW.getTime() - WINDOW_DAYS * DAY_MS),
      to: NOW,
      compare: true,
    };
    await generate();
  }, 600_000);

  afterAll(async () => {
    await cleanup();
  }, 120_000);

  it("every analytics query returns under 800ms at p95", async () => {
    const results = {
      lineAnalytics: await p95("getLineAnalytics", () => getLineAnalytics(actor, filters)),
      funnel: await p95("getFunnel", () => getFunnel(actor, filters)),
      timeSeries: await p95("getTimeSeries", () => getTimeSeries(actor, filters, "day")),
      breakdownSignal: await p95("getBreakdown:signal", () => getBreakdown(actor, filters, "signal")),
      heatmap: await p95("getReplyHeatmap", () => getReplyHeatmap(actor, filters)),
      overview: await p95("getOverview", () =>
        getOverview(actor, { lines: LINES, from: filters.from, to: filters.to }),
      ),
    };
    for (const [label, value] of Object.entries(results)) {
      expect(value, `${label} p95 ${value.toFixed(0)}ms exceeds ${String(P95_BUDGET_MS)}ms`).toBeLessThan(
        P95_BUDGET_MS,
      );
    }
  }, 300_000);
});
