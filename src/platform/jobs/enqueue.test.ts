import { describe, expect, it } from "vitest";

import { db } from "@/platform/db";

import { enqueueJob } from "./enqueue";

describe("enqueueJob (INV-22)", () => {
  it("returns the existing run on duplicate idempotency key", async () => {
    const key = `test:enqueue:${Date.now().toString(36)}`;
    const a = await enqueueJob("platform.job-runs-cleanup", { retentionDays: 30 }, {
      actor: { type: "SYSTEM", job: "test" },
      idempotencyKey: key,
    });
    const b = await enqueueJob("platform.job-runs-cleanup", { retentionDays: 30 }, {
      actor: { type: "SYSTEM", job: "test" },
      idempotencyKey: key,
    });
    expect(b.jobRunId).toBe(a.jobRunId);
    expect(b.deduplicated).toBe(true);

    // Cleanup.
    await db.jobRun.deleteMany({ where: { idempotencyKey: key } });
  });

  it("rejects an invalid input with VALIDATION_FAILED", async () => {
    await expect(
      enqueueJob(
        "platform.job-runs-cleanup",
        { retentionDays: -5 },
        { actor: { type: "SYSTEM", job: "test" }, idempotencyKey: "invalid-test" },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects an unknown job name", async () => {
    await expect(
      enqueueJob(
        "platform.does-not-exist",
        {},
        { actor: { type: "SYSTEM", job: "test" }, idempotencyKey: "missing" },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
