/**
 * Regression test for the cron SYSTEM-actor identity.
 *
 * `assertActorCan` resolves a SYSTEM actor by looking `actor.job` up in the job/subscriber
 * registry and allowing only that entry's `systemActions` (permissions.md rule 10). The dispatcher
 * used to enqueue cron work as `cron.<job>`, which matches nothing in the registry — so every
 * scheduled job that asserts a system action failed with FORBIDDEN while the same job succeeded
 * when a user ran it from the UI. Autonomous sourcing, compliance re-evaluation and the weekly
 * analytics report were all dead because of it.
 *
 * These tests pin the invariant: the actor a cron run carries must BE a registered job name.
 */

import { describe, expect, it } from "vitest";

import { getAllJobs, getCronSchedules } from "@/platform/registry";

import { cronActor } from "./dispatcher";
import { platformJobs, platformSchedules } from "./platform-jobs";

describe("cronActor", () => {
  it("uses the bare job name, with no prefix or other decoration", () => {
    expect(cronActor("acquisition.sourcing.run")).toEqual({
      type: "SYSTEM",
      job: "acquisition.sourcing.run",
    });
  });

  it("names a job the registry can resolve, so systemActions are honoured", () => {
    const registered = new Set([
      ...platformJobs.map((job) => job.name),
      ...getAllJobs().map((job) => job.name),
    ]);
    // The registry must know the job the actor names; otherwise every systemAction is denied.
    expect(registered.has(cronActor("acquisition.sourcing.run").job)).toBe(true);
  });

  it("resolves for every schedule the dispatcher can fire", () => {
    const registered = new Set([
      ...platformJobs.map((job) => job.name),
      ...getAllJobs().map((job) => job.name),
    ]);
    const schedules = [...platformSchedules, ...getCronSchedules()];
    expect(schedules.length).toBeGreaterThan(0);

    const unresolvable = schedules
      .map((schedule) => cronActor(schedule.job).job)
      .filter((job) => !registered.has(job));

    expect(unresolvable).toEqual([]);
  });
});
