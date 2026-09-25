# Wave 2: Prep and Merge Guide

Wave 2 builds the **acquisition engine**. Four phases run in parallel:

- **7** Service-line profiles and the runtime FUTUREUNI skill
- **8** Sourcing framework and adapters
- **9** Enrichment, contact discovery and compliance
- **10** Audit agents for each service line

Wave 1 must be fully merged, and its integration session (Part C3 of `wave-1-prep-and-merge.md`) must have passed.

---

## Part A: Before starting Wave 2 (on `main`)

### A1. Ownership map additions

Open Claude Code on `main` and say:

> "Update scripts/ownership/ownership.json and the CLAUDE.md ownership table with the Wave 2 additions in docs/prompts/wave-2-prep-and-merge.md, Part A1. Then run the ownership duplicate check."

| Phase | Add to `owns` |
|---|---|
| 05 (narrow) | Change `evals/**` to `evals/_runner/**` and `evals/platform/**`, so acquisition evals can belong to the phase that owns the task |
| 07 | `src/modules/acquisition/profiles/**`, `runtime-skills/acquisition/_references/**`, `evals/acquisition/profiles/**` |
| 08 | `src/modules/acquisition/sourcing/**`, `runtime-skills/acquisition/source-*/**`, `evals/acquisition/source-*/**` |
| 09 | `src/modules/acquisition/enrichment/**`, `src/modules/acquisition/compliance/**`, `src/platform/http/**`, `runtime-skills/acquisition/enrich-*/**`, `evals/acquisition/enrich-*/**` |
| 10 | `src/modules/acquisition/audits/**`, `src/platform/browser/**`, `runtime-skills/acquisition/audit-*/**`, `evals/acquisition/audit-*/**` |

### A2. Prompts

Copy `phase-07-profiles.md`, `phase-08-sourcing.md`, `phase-09-enrichment.md`, `phase-10-audits.md` and this file into `docs/prompts/`, then commit.

### A3. Start the four terminals

```bash
pnpm phase start 07 profiles
pnpm phase start 08 sourcing
pnpm phase start 09 enrichment
pnpm phase start 10 audits
```

In each worktree, open Claude Code at maximum effort and in plan mode, then say:

> "Read docs/prompts/phase-NN-….md and execute it. Plan first."

---

## Part B: Shared agreements for Wave 2

### B1. Runtime reference files (written by Phase 7, used by the AI tasks of Phases 8, 9 and 10)

These paths are fixed. Phase 7 creates exactly these files. Phases 8, 9 and 10 reference exactly these paths in their AI task definitions.

```
runtime-skills/acquisition/_references/
  services-catalogue.md            # what FUTUREUNI sells, per line, with packages
  evidence-rules.md                # how findings and claims must be sourced and phrased
  lines/web-development.md         # what "good" looks like + common problems + how to talk about them
  lines/ui-ux-design.md
  lines/graphic-design.md
  lines/video-editing.md
  markets/nigeria.md               # tone, channels, trust signals, currency, etiquette, compliance notes
  markets/international.md         # tone, timezone-overlap angle, currencies, compliance notes (UK/EU/US)
```

Until Wave 2 is merged, these files don't exist in the worktrees of Phases 8, 9 and 10. Those phases declare the references as **optional** in their task definitions, using the Phase 5 loader's optional-reference feature. If the loader doesn't have one, raise a request against Phase 5 and ask for the tolerate-missing-in-development behaviour. The integration session makes them required.

### B2. Seams

| Seam ID | Stand-in lives in (consumer) | Real implementation (provider) | Signature |
|---|---|---|---|
| `SEAM-PROFILE` | Phases 8, 9, 10: `<folder>/_seams.ts` | Phase 7: `@/modules/acquisition/profiles` | `getActiveProfile(line: ServiceLine): Promise<ServiceLineProfile>` and `listActiveProfiles(): Promise<ServiceLineProfile[]>`. The stand-in reads the active `ServiceLineProfileVersion` row from the database and parses it with the contract schema. |
| `SEAM-SAFE-FETCH` | Phases 8, 10: `<folder>/_seams.ts` | Phase 9: `@/platform/http` | `safeFetch(url: string, opts?: SafeFetchOptions): Promise<SafeFetchResult>` and `isAllowedByRobots(url: string, userAgent?: string): Promise<boolean>`. The stand-in is a minimal version: plain fetch with a timeout, an SSRF guard for private IPs, and no robots cache. Types are defined in Phase 9's prompt and copied exactly. |

```ts
// Shared types for SEAM-SAFE-FETCH (copy exactly)
export type SafeFetchOptions = {
  method?: "GET" | "HEAD"; headers?: Record<string, string>;
  timeoutMs?: number;            // default 10000
  maxBytes?: number;             // default 2_000_000
  respectRobots?: boolean;       // default true
  followRedirects?: number;      // default 5
  cacheTtlSeconds?: number;      // default 0 (no cache)
};
export type SafeFetchResult = {
  ok: boolean; status: number; finalUrl: string; headers: Record<string, string>;
  contentType: string | null; body: string | null; bytes: number; fetchedAt: string;
  blockedReason?: "robots" | "ssrf" | "too-large" | "timeout" | "non-html" | "error";
};
```

### B3. Jobs, settings and AI tasks from Wave 2 phases

The acquisition manifest (`src/modules/acquisition/manifest.ts`) belongs to Phase 19. Wave 2 phases don't edit it. Each phase instead **exports** what it registers from its own folder:

- `jobs.ts`: `export const <area>Jobs: JobDefinition[]`
- `settings.ts`: `export const <area>Settings: SettingDefinition[]`
- `tasks.ts`: AI tasks, following the discovery convention in `src/platform/ai/README.md`
- (Phase 8 only) `schedules.ts`: `export const getSourcingDynamicSchedules`

Each phase lists these exports in its `REQUESTS.md`. The integration session adds them to the manifest. Inside a phase, tests call jobs through Phase 6's inline job runner directly.

### B4. Lead lifecycle ownership in Wave 2

All transitions go through `transitionLead()` from `@/modules/acquisition/core`. Each phase makes only its own transitions:

| Transition | Made by |
|---|---|
| Create a lead in `NEW` | Phase 8 |
| `NEW → ENRICHING → ENRICHED` | Phase 9 |
| `ENRICHED → AUDITING → AUDITED` | Phase 10 |
| `→ SUPPRESSED`, `→ DISQUALIFIED` (compliance reasons only) | Phase 9 |
| `AUDITED → SCORED` and beyond | Wave 3 |

---

## Part C: After all four phases finish

### C1. Check each phase

In each worktree run `pnpm phase finish <nn>`.

### C2. Merge in this order

Merge **7 → 9 → 8 → 10**:

- profiles first, because everyone reads them
- then the safe fetcher (inside 9)
- then the consumers

After each merge:

1. `pnpm install`
2. `pnpm registry:gen`
3. `pnpm db:migrate`, if a schema request was approved
4. `pnpm check`

### C3. The Wave 2 integration session

On `main`, say:

> "Read docs/prompts/wave-2-prep-and-merge.md Part C3 and do it."

The session must:

1. Read `phases/07..10/SUMMARY.md` and `REQUESTS.md`.
2. **Connect every seam** in B2. Replace the stand-ins, delete them, and confirm `grep -r "SEAM:" src` returns nothing.
3. **Make the B1 references required** in every Wave 2 task definition. Run `pnpm evals` in mock mode for every acquisition task.
4. **Register everything in the acquisition manifest:**
   - every Wave 2 job
   - every setting
   - the dynamic schedules provider
   - any new permissions or notification types

   Then run `pnpm registry:gen` and confirm `getCronSchedules()` and `getAllJobs()` list them.
5. **Apply the remaining change requests.** Contract updates (for example new source adapter IDs), `data-model.md` updates, and schema changes as a new migration. List any rejected requests with reasons.
6. **Write and run `tests/integration/wave-2-pipeline.test.ts`** in mock mode. For **each of the four service lines, in both markets**:
   - run a search (`runSearch`) with that line's default sources
   - leads are created in `NEW`, and companies are deduplicated (running the same search twice creates no duplicates)
   - enrich them: contacts, socials, legal form and a contactability verdict are stored, and a UK sole trader is flagged as consent-required
   - audit them: findings are stored, and every finding has evidence plus a source URL or artifact
   - leads end in `AUDITED`, with a `LeadEvent` for every transition
   - a suppressed company is never turned into a new lead
7. **Optional live smoke test.** If real keys are present in the credentials vault, run one real search per line limited to 3 results, with enrichment and audits, and report the cost from `AiCall` and the adapter counts. Skip this if there are no keys.
8. `pnpm check`, then `saas-review` on the integration diff.
9. Write `phases/wave-2-integration/SUMMARY.md`.

**When C3 passes, Wave 2 is done and Wave 3 (Phases 11–14) can start.**
