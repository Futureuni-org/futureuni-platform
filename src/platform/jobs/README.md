# @/platform/jobs

Durable background jobs on Vercel Workflow (`docs/contracts/jobs.md`). A module declares jobs on
its manifest; the platform starts them, records every run in `JobRun`, retries failed steps, and
guarantees one run per idempotency key (`INV-22`).

## Example

```ts
import { enqueueJob } from "@/platform/jobs";

const { jobRunId, deduplicated } = await enqueueJob(
  "platform.credentials-health",
  {},
  { actor: { type: "SYSTEM", job: "cron.tick" } },
);
```

## Local

- `pnpm jobs:run <name> '<json>'` runs a job through the inline runner (no Workflow).
- Tests use `runJobInline` for the same semantics.

Every job goes through the `platform.run-job` workflow in `src/workflows/_platform/` so retries
and observability are uniform for `single` and `workflow` handlers alike.
