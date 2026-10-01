# Phase 10 — Change requests

Applied at Wave-2 integration (Part C3 of `docs/prompts/wave-2/wave-2-prep-and-merge.md`).

## Seams

Both seams Phase 10 consumes were already **merged on `main`**, so the real implementations were
called directly and **no stand-ins were written** (seam rule):

- **SEAM-PROFILE** → `getActiveProfile` from `@/modules/acquisition/profiles` (Phase 7).
- **SEAM-SAFE-FETCH** → `safeFetch` / `isAllowedByRobots` / `guardUrl` from `@/platform/http` (Phase 9).

`grep -r "SEAM:" src` returns nothing for Phase 10.

## CR-10-01 — Manifest registration (type: manifest; owner: Phase 19)

Register the audit area's exports on `src/modules/acquisition/manifest.ts` (same pattern as
enrichment):

```ts
import { auditJobs } from "./audits/jobs";
import { auditSettings } from "./audits/settings";
import { auditTasks } from "./audits/tasks";
// jobs:     [...enrichmentJobs, ...complianceJobs, ...auditJobs]
// settings: [...profilesSettings, ...enrichmentSettings, ...complianceSettings, ...auditSettings]
// aiTasks:  [...profilesAiTasks, ...enrichmentTasks, ...auditTasks]
```

- Jobs: `acquisition.audits.lead`, `acquisition.audits.batch`, `acquisition.audits.refresh`.
- Settings: `acquisition.audits.*` (cost cap, cache TTL, max required failures, batch size, refresh
  days, PageSpeed thresholds, video gone-quiet days). Read defensively via `audits/config.ts`, so the
  module already works before registration.
- AI tasks (6): `audit-web-first-impression`, `audit-uiux-review-analysis`, `audit-uiux-heuristics`,
  `audit-graphic-consistency`, `audit-video-thumbnails`, `audit-video-titles`. Evals live under
  `evals/acquisition/audit-*`; they run once the tasks are registered.

## CR-10-02 — Schedules (type: schedule; owner: Phase 19, final times in `docs/schedules.md`)

- `acquisition.audits.batch` — every ~10 minutes (picks up `ENRICHED` leads, `Africa/Lagos`).
- `acquisition.audits.refresh` — daily (re-audit active leads older than the setting before a new step).

## CR-10-03 — Platform screenshot-retention setting (type: setting; owner: Phase 6 / platform)

The contract uses `platform.retention.screenshotsDays` (default 90) for audit-screenshot retention, and
`@/platform/browser` reads it defensively (default 90 when unregistered). Register it as a platform
setting, or confirm the 90-day default. Phase 10 did **not** add a duplicate `acquisition.audits.*`
retention key.

## CR-10-04 — Dependencies added (type: dependency)

Added with `pnpm add` (listed in SUMMARY):

- `sharp` — PNG→WebP screenshot conversion (lazy-imported only in the capture path).
- `@vercel/sandbox` — the ADR-017 primary browser runtime.
- `playwright-core` — the capture engine for `local-playwright` and type definitions.

None has an `install`/`postinstall` script, so no `pnpm-workspace.yaml` `allowBuilds` change is needed.
Lockfile conflicts are resolved at merge by reinstalling.

## CR-10-05 — Contract notes (type: contract; non-blocking, no change required to ship)

Minor gaps in `src/contracts/audit-agent.ts` `AuditContext`, worked around in Phase 10:

- No `actor` field — AI calls in checks run as a SYSTEM actor (`acquisition.audits.lead`) for AiCall
  attribution. Consider adding `actor` (and `jobRunId`) if per-user attribution of audit AI calls is
  wanted.
- No full configured-check set — only `requiredChecks` is provided, so agents run **every** check they
  define and use `requiredChecks` to gate the transition. A profile can make a check optional but not
  disable it entirely. Consider adding `configuredChecks` if profiles should switch checks off.

## CR-10-06 — Pre-existing lint error in `src/platform/ai/registry.ts` (type: pre-existing; owner: Phase 5 / main)

`eslint .` (and therefore `pnpm check`) fails on one error **not introduced by Phase 10**:

```
src/platform/ai/registry.ts  17:8  error  'DefineTask' is defined but never used  @typescript-eslint/no-unused-vars
```

This is inherited from the commit this phase branched from. `main`'s working tree already removes this
unused `type DefineTask` import (it showed as an uncommitted change at phase start). The ownership guard
correctly blocks Phase 10 from editing a Phase-5 file, so it was **not** changed here. Resolve by
committing `main`'s existing fix (delete line 17 of `src/platform/ai/registry.ts`) before/at merge.
Everything Phase 10 owns passes lint, typecheck, test and build.

## Deviations

- `vercel-sandbox` returns screenshot bytes to the app, which stores them via `@/platform/storage`
  (one storage/retention/FileObject path), rather than uploading to Blob from inside the sandbox as
  ADR-017 describes. Functionally equivalent.

## Schema / other-path edits

**None.** All audit models (`Audit`, `AuditCheckRun`, `AuditFinding`, `AuditCacheEntry`), the
`FilePurpose.AUDIT_SCREENSHOT` value and `Lead.auditFailureCount`/`needsAttentionAt` already existed
from Phase 2. All Phase 10 env variables already existed in `.env.example` / `src/env.ts`.
