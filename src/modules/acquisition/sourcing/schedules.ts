import "server-only";

/**
 * Dynamic schedules for sourcing (Phase 8): one schedule per enabled saved search, which the
 * platform cron dispatcher turns into `acquisition.sourcing.run` jobs. Capacity is enforced when
 * the job runs (so the skip is recorded exactly once per due slot, not on every tick):
 * `skipScheduledRunIfAtCapacity` records a SKIPPED SearchRun and notifies the line owners at most
 * once a day (module spec §3.5, §3.10, AC-4.3).
 */

import type { Actor, Clock, ServiceLine } from "@/contracts/common";
import type { DynamicSchedule, DynamicScheduleProvider } from "@/contracts/jobs";
import { db } from "@/platform/db";
import { isLineAtCapacity } from "@/platform/team";
import { notify } from "@/platform/notifications";

import { platformDay } from "./limiter";
import {
  createSkippedSearchRun,
  getSavedSearch,
  listEnabledSavedSearches,
  updateSavedSearch,
} from "./sourcing.repo";

export const getSourcingDynamicSchedules: DynamicScheduleProvider = async (): Promise<
  DynamicSchedule[]
> => {
  const saved = await listEnabledSavedSearches();
  return saved.map((ss) => ({
    id: `saved-search:${ss.id}`,
    job: "acquisition.sourcing.run",
    cron: ss.cron,
    timezone: ss.timezone,
    description: `Saved search "${ss.name}"`,
    input: {
      spec: ss.spec,
      savedSearchId: ss.id,
      slot: "", // the dispatcher appends the slot ISO to the dedup key
      notifyUserId: ss.ownerId,
    },
  }));
};

export interface SkipCheckInput {
  savedSearchId: string;
  spec: { serviceLine?: ServiceLine; markets?: ("NIGERIA" | "INTERNATIONAL")[] } & Record<
    string,
    unknown
  >;
  actor: Actor;
  clock: Clock;
}

/**
 * When the line is at capacity, records a SKIPPED SearchRun and notifies the owners (once a day),
 * then returns true so the job stops without sourcing. Returns false when the run may proceed.
 */
export async function skipScheduledRunIfAtCapacity(input: SkipCheckInput): Promise<boolean> {
  const serviceLine = input.spec.serviceLine;
  if (serviceLine === undefined) return false;
  if (!(await isLineAtCapacity(serviceLine))) return false;

  const markets = input.spec.markets ?? ["NIGERIA", "INTERNATIONAL"];
  await createSkippedSearchRun(db, {
    serviceLine,
    markets,
    spec: input.spec,
    trigger: "SCHEDULED",
    actor: input.actor,
    savedSearchId: input.savedSearchId,
    skipReason: "capacity",
  });

  const day = platformDay(input.clock.now()).toISOString().slice(0, 10);
  const saved = await getSavedSearch(input.savedSearchId);
  const alreadyToday =
    saved?.lastCapacitySkipNotifiedAt != null &&
    platformDay(saved.lastCapacitySkipNotifiedAt).toISOString().slice(0, 10) === day;
  if (!alreadyToday) {
    await notify({
      serviceLine,
      type: "capacity.line-full",
      title: `${serviceLine.replace(/_/g, " ")} is at capacity`,
      body: "A scheduled search was skipped because the line is full.",
      data: { serviceLine },
      dedupeKey: `capacity.line-full:${serviceLine}:${day}`,
    }).catch(() => undefined);
    await updateSavedSearch(input.savedSearchId, {
      lastCapacitySkipNotifiedAt: input.clock.now(),
    }).catch(() => undefined);
  }
  return true;
}
