/**
 * Cron slot dispatcher (Phase 6).
 *
 * Given a wall-clock `now`, computes which static and dynamic schedules are due in the current
 * 5-minute slot (per each schedule's own timezone) and enqueues each one with the idempotency
 * key `"<job>:<slot-iso>"` (static) or `"<job>:<scheduleId>:<slot-iso>"` (dynamic).
 *
 * The cron itself runs every 5 minutes; a duplicated tick is safe because the idempotency key
 * collapses it.
 */

import "server-only";

import { Cron } from "croner";

import type { CronSchedule, DynamicSchedule, JobName } from "@/contracts/jobs";
import {
  getCronSchedules,
  getDynamicScheduleProviders,
  getEnabledModules,
} from "@/platform/registry";
import { getSetting } from "@/platform/settings";

import { enqueueJob } from "./enqueue";
import { platformSchedules } from "./platform-jobs";

const SLOT_MS = 5 * 60 * 1000;

/**
 * How far back a single tick will reach to run a schedule whose exact 5-minute slot was missed.
 *
 * The cron is meant to tick every 5 minutes, but a best-effort scheduler (e.g. GitHub Actions'
 * free scheduled workflows) can skip hours of ticks. Without catch-up a once-a-day search whose
 * 09:00 slot had no tick is lost for the day. With it, the first tick after 09:00 still runs that
 * day's searches. Per-slot idempotency (`<job>:<slot>`) keeps a caught-up run from firing twice,
 * and only the *most recent* due slot is caught up — a 5-minute job is never backfilled 288×.
 */
const CATCHUP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Returns the ISO string for the 5-minute slot containing `now`, floored. */
export function slotIso(now: Date): string {
  const floored = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS);
  return floored.toISOString();
}

/**
 * True when the schedule fires at any moment in the 5-minute slot that contains `now`.
 *
 * Croner's `previousRuns(1, ref)` returns runs strictly before `ref`, so we ask "what's the next
 * fire from the start of this slot?"; if it falls before the slot's end (i.e. still within it),
 * the schedule is due.
 */
export function isScheduleDue(schedule: { cron: string; timezone: string }, now: Date): boolean {
  const cron = new Cron(schedule.cron, { timezone: schedule.timezone });
  const slotStartMs = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  const slotStart = new Date(slotStartMs - 1); // one ms before, so `nextRuns` includes a boundary hit
  const next = cron.nextRuns(1, slotStart)[0];
  if (next === undefined) return false;
  return next.getTime() >= slotStartMs && next.getTime() < slotStartMs + SLOT_MS;
}

/**
 * The slot ISO of the most recent time `schedule` fired at or before `now`, when that fire was
 * within `lookbackMs` — otherwise null. Unlike `isScheduleDue` (current slot only) this lets a late
 * tick catch up a slot whose own tick was skipped. The returned slot is used as the idempotency
 * key, so re-running catch-up on later ticks collapses to the same already-run slot.
 */
export function mostRecentDueSlot(
  schedule: { cron: string; timezone: string },
  now: Date,
  lookbackMs: number,
): string | null {
  const cron = new Cron(schedule.cron, { timezone: schedule.timezone });
  const prev = cron.previousRuns(1, new Date(now.getTime() + 1))[0];
  if (prev === undefined) return null;
  if (prev.getTime() < now.getTime() - lookbackMs) return null;
  return slotIso(prev);
}

async function isEnabled(job: JobName): Promise<boolean> {
  try {
    return await getSetting<boolean>(`jobs.${job}.enabled`);
  } catch {
    return true; // if no setting registered, default to enabled
  }
}

interface DispatchResult {
  now: string;
  slot: string;
  enqueued: {
    job: string;
    idempotencyKey: string;
    deduplicated: boolean;
    kind: "static" | "dynamic";
  }[];
  skipped: { job: string; reason: string }[];
}

/** The main entry called by `GET /api/cron/tick`. */
export async function runDispatch(now: Date): Promise<DispatchResult> {
  const slot = slotIso(now);
  const enqueued: DispatchResult["enqueued"] = [];
  const skipped: DispatchResult["skipped"] = [];

  // Only enabled modules contribute schedules; a disabled module's crons stop (CR-02-21, rule 4).
  const enabledModules = await getEnabledModules();
  const staticSchedules: (CronSchedule & { module: string })[] = [
    ...platformSchedules.map((s) => ({ ...s, module: "platform" })),
    ...getCronSchedules(enabledModules),
  ];

  for (const schedule of staticSchedules) {
    const dueSlot = mostRecentDueSlot(schedule, now, CATCHUP_LOOKBACK_MS);
    if (dueSlot === null) continue;
    if (!(await isEnabled(schedule.job))) {
      skipped.push({ job: schedule.job, reason: "disabled" });
      continue;
    }
    const key = `${schedule.job}:${dueSlot}`;
    const { deduplicated } = await enqueueJob(schedule.job, schedule.input ?? {}, {
      actor: { type: "SYSTEM", job: `cron.${schedule.job}` },
      idempotencyKey: key,
    });
    enqueued.push({ job: schedule.job, idempotencyKey: key, deduplicated, kind: "static" });
  }

  for (const { provider } of getDynamicScheduleProviders(enabledModules)) {
    const dynamic: DynamicSchedule[] = await provider({ clock: { now: () => now } });
    for (const schedule of dynamic) {
      const dueSlot = mostRecentDueSlot(schedule, now, CATCHUP_LOOKBACK_MS);
      if (dueSlot === null) continue;
      if (schedule.skip !== undefined) {
        skipped.push({ job: schedule.job, reason: schedule.skip.reason });
        continue;
      }
      if (!(await isEnabled(schedule.job))) {
        skipped.push({ job: schedule.job, reason: "disabled" });
        continue;
      }
      const key = `${schedule.job}:${schedule.id}:${dueSlot}`;
      const { deduplicated } = await enqueueJob(schedule.job, schedule.input, {
        actor: { type: "SYSTEM", job: `cron.${schedule.job}` },
        idempotencyKey: key,
      });
      enqueued.push({ job: schedule.job, idempotencyKey: key, deduplicated, kind: "dynamic" });
    }
  }

  return { now: now.toISOString(), slot, enqueued, skipped };
}
