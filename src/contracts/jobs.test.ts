import { describe, expect, it } from "vitest";

import {
  CronScheduleSchema,
  JobCountsSchema,
  JobDefinitionMetaSchema,
  JobNameSchema,
} from "./jobs";
import { issuePaths } from "./test-helpers";

describe("jobs contract", () => {
  it("parses the worked example (docs/contracts/jobs.md §5)", () => {
    const schedule = CronScheduleSchema.parse({
      id: "enrichment-batch",
      job: "acquisition.enrichment.batch",
      cron: "*/15 * * * *",
      timezone: "Africa/Lagos",
    });
    expect(schedule.job).toBe("acquisition.enrichment.batch");

    const meta = JobDefinitionMetaSchema.parse({
      name: "acquisition.enrichment.lead",
      description:
        "Enrich one lead: crawl, find and verify emails, run compliance, then move it to ENRICHED.",
      handlerKind: "workflow",
      steps: ["crawl", "finder", "verify", "compliance", "finalise"],
      concurrency: 5,
      timeoutMs: 120_000,
      retry: { maxAttempts: 3, backoff: "exponential", initialDelayMs: 2_000, maxDelayMs: 60_000 },
      allowManualRun: false,
      systemActions: ["acquisition.lead.update"],
    });
    expect(meta.notifyOnFailure).toBe(true);
  });

  it("rejects the invalid example (§6): bad name, short description, zero concurrency", () => {
    const result = JobDefinitionMetaSchema.safeParse({
      name: "enrichLead",
      description: "Run",
      handlerKind: "single",
      concurrency: 0,
      timeoutMs: 120000,
      retry: {},
    });
    expect(issuePaths(result).sort()).toEqual(["concurrency", "description", "name"]);
  });

  it("names jobs <module>.<job-name> or <module>.<area>.<job-name>", () => {
    expect(JobNameSchema.safeParse("platform.retention-purge").success).toBe(true);
    expect(JobNameSchema.safeParse("acquisition.enrichment.lead").success).toBe(true);
    expect(JobNameSchema.safeParse("acquisition.a.b.c").success).toBe(false);
  });

  it("counts are named non-negative integers", () => {
    expect(JobCountsSchema.safeParse({ found: 42, created: 17 }).success).toBe(true);
    expect(JobCountsSchema.safeParse({ found: -1 }).success).toBe(false);
  });
});
