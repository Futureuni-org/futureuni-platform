import "server-only";

/**
 * Capacity throttling (module spec §3.10, phase-11 Step 6). `getOutreachThrottle` is SEAM-THROTTLE:
 * it tells the outreach engine whether new first touches may go out for a line, and how many have
 * already been approved today. `refreshLineCapacity` detects mode changes (emitting
 * `capacity.mode.changed`, which the platform notification router turns into `capacity.line-full`)
 * and, when a line leaves PAUSED, releases capacity-held nurture leads.
 */

import type { Actor, CapacityMode, ServiceLine } from "@/contracts/common";
import { ServiceLineSchema } from "@/contracts/common";
import { publishAfterCommit } from "@/platform/events";
import { notify } from "@/platform/notifications";
import { getLineCapacity } from "@/platform/team";
import { withTransaction } from "@/platform/db";

import { getThrottleThresholds } from "./config";
import {
  countFirstTouchesToday,
  findCapacityHeldLeads,
  getLineCapacityState,
  setLineCapacityMode,
} from "./throttle.repo";

export const ALL_SERVICE_LINES: readonly ServiceLine[] = ServiceLineSchema.options;

/** SEAM-THROTTLE return shape (docs/prompts/wave-3/wave-3-prep-and-merge.md Part B2). */
export interface OutreachThrottle {
  mode: "NORMAL" | "SLOW" | "PAUSED";
  newFirstTouchesToday: number;
  reason: string;
}

export interface ThrottleThresholdsResolved {
  slowAtPercent: number;
  pauseAtPercent: number;
  slowFactor: number;
  dailyFirstTouchCap: number;
}

// ---- Pure helpers (unit-tested) --------------------------------------------

/** The load/capacity percent; capacity of 0 (no team) reads as fully loaded, so the line pauses. */
export function loadPercent(capacity: number, load: number): number {
  return capacity > 0 ? (load / capacity) * 100 : Number.POSITIVE_INFINITY;
}

export function computeThrottleMode(
  percent: number,
  thresholds: { slowAtPercent: number; pauseAtPercent: number },
): CapacityMode {
  if (percent >= thresholds.pauseAtPercent) return "PAUSED";
  if (percent >= thresholds.slowAtPercent) return "SLOW";
  return "NORMAL";
}

/** The day's first-touch cap for a mode: full cap when NORMAL, a fraction when SLOW, none when PAUSED. */
export function effectiveDailyCap(
  mode: CapacityMode,
  opts: { dailyCap: number; slowFactor: number },
): number {
  if (mode === "PAUSED") return 0;
  if (mode === "SLOW") return Math.floor(opts.dailyCap * opts.slowFactor);
  return opts.dailyCap;
}

/** The [start, end) UTC instants of today's Africa/Lagos calendar day (Nigeria is a fixed +01:00). */
export function lagosDayRange(now: Date): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${ymd}T00:00:00+01:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function reasonFor(mode: CapacityMode, capacity: number, load: number): string {
  if (capacity <= 0) return "No team is assigned to this line.";
  const pct = Math.round(loadPercent(capacity, load));
  const ratio = `${String(pct)}% of capacity (${String(load)}/${String(capacity)})`;
  if (mode === "PAUSED") return `Load is ${ratio}; outreach is paused.`;
  if (mode === "SLOW") return `Load is ${ratio}; outreach is slowed.`;
  return `Load is ${ratio}.`;
}

// ---- Resolution (profile overrides settings) --------------------------------

async function resolveThresholds(line: ServiceLine): Promise<ThrottleThresholdsResolved> {
  const base = await getThrottleThresholds();
  const { getActiveProfile } = await import("@/modules/acquisition/profiles");
  const profile = await getActiveProfile(line);
  const policy = profile.capacityPolicy;
  return {
    slowAtPercent: policy.slowAtPercent,
    pauseAtPercent: policy.pauseAtPercent,
    slowFactor: policy.slowFactor,
    dailyFirstTouchCap: policy.dailyFirstTouchCap ?? base.dailyFirstTouchCap,
  };
}

export interface ThrottleDetail extends OutreachThrottle {
  dailyCap: number;
  percent: number;
  capacity: number;
  load: number;
}

/** Full throttle picture for a line at a given instant (used by getOutreachThrottle and the UI service). */
export async function computeThrottle(line: ServiceLine, now: Date): Promise<ThrottleDetail> {
  const [thresholds, capacity] = await Promise.all([resolveThresholds(line), getLineCapacity(line)]);
  const percent = loadPercent(capacity.capacity, capacity.load);
  const mode = computeThrottleMode(percent, thresholds);
  const dailyCap = effectiveDailyCap(mode, {
    dailyCap: thresholds.dailyFirstTouchCap,
    slowFactor: thresholds.slowFactor,
  });
  const newFirstTouchesToday = await countFirstTouchesToday(line, lagosDayRange(now));
  return {
    mode,
    newFirstTouchesToday,
    reason: reasonFor(mode, capacity.capacity, capacity.load),
    dailyCap,
    percent: Number.isFinite(percent) ? Math.round(percent) : 100,
    capacity: capacity.capacity,
    load: capacity.load,
  };
}

/** SEAM-THROTTLE. */
export async function getOutreachThrottle(line: ServiceLine): Promise<OutreachThrottle> {
  const { mode, newFirstTouchesToday, reason } = await computeThrottle(line, new Date());
  return { mode, newFirstTouchesToday, reason };
}

// ---- Mode changes and release ----------------------------------------------

export interface RefreshResult {
  from: CapacityMode;
  to: CapacityMode;
  released: number;
}

/**
 * Recomputes a line's mode, persists it and emits `capacity.mode.changed` when it changes. On
 * leaving PAUSED, releases capacity-held nurture leads back to SCORED in score order.
 */
export async function refreshLineCapacity(
  line: ServiceLine,
  opts: { now: Date; actor: Actor },
): Promise<RefreshResult> {
  const detail = await computeThrottle(line, opts.now);
  const state = await getLineCapacityState(line);
  const from = state?.mode ?? "NORMAL";
  const to = detail.mode;
  if (from === to) return { from, to, released: 0 };

  await withTransaction(async (tx) => {
    await setLineCapacityMode(tx, line, to, opts.now);
    await publishAfterCommit(tx, {
      name: "capacity.mode.changed",
      actor: opts.actor,
      payload: { serviceLine: line, from, to },
    });
  });

  let released = 0;
  if (from === "PAUSED" && to !== "PAUSED") {
    released = await releaseCapacityHeld(line, { now: opts.now, actor: opts.actor, cap: detail.dailyCap });
  }
  return { from, to, released };
}

/**
 * Moves NURTURE(CAPACITY) leads back to SCORED in score order, up to the day's cap, re-scoring each
 * so a lead that no longer qualifies isn't released. Notifies the line owners once.
 */
export async function releaseCapacityHeld(
  line: ServiceLine,
  opts: { now: Date; actor: Actor; cap: number },
): Promise<number> {
  if (opts.cap <= 0) return 0;
  const held = await findCapacityHeldLeads(line, opts.cap);
  if (held.length === 0) return 0;

  const { qualifyLead } = await import("./qualify");
  const clock = { now: () => opts.now };
  let released = 0;
  for (const lead of held) {
    const result = await qualifyLead(lead.id, { actor: opts.actor, clock });
    if (result.status === "SCORED") released += 1;
  }

  if (released > 0) {
    const { getLineOwners } = await import("@/modules/acquisition/profiles");
    const owners = await getLineOwners(line);
    if (owners.length > 0) {
      const day = lagosDayRange(opts.now).start.toISOString().slice(0, 10);
      try {
        await notify({
          userIds: owners.map((o) => o.id),
          type: "capacity.line-released",
          title: `Capacity freed: ${line}`,
          body: `${String(released)} lead${released === 1 ? "" : "s"} released back to the review pipeline.`,
          dedupeKey: `capacity-released:${line}:${day}`,
        });
      } catch (error) {
        // Best-effort: a notification failure never undoes a release.
        console.warn(JSON.stringify({ event: "capacity.release.notify.failed", line, error: String(error) }));
      }
    }
  }
  return released;
}

/** Refreshes every line's capacity mode (the capacity.release job). */
export async function refreshAllLines(opts: { now: Date; actor: Actor }): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const line of ALL_SERVICE_LINES) {
    results.push(await refreshLineCapacity(line, opts));
  }
  return results;
}
