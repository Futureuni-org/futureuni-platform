# Phase 10: Audits: Summary

| | |
|---|---|
| Phase | 10, Audits |
| Branch | `phase/10-audits` |
| Batch / wave | B3 / Wave 2 |
| Date finished | 2026-10-01 |
| Prompt | `docs/prompts/wave-2/phase-10-audits.md` |
| Verification | `pnpm check`: lint Pass for Phase-10 code (1 pre-existing error in `src/platform/ai/registry.ts`, Phase-5-owned, see REQUESTS CR-10-06) · typecheck Pass · test Pass (834, incl. 50 new) · build Pass · `pnpm test:e2e`: Not run (no UI in this phase) · `saas-review`: no open Critical/Major |

## What was built

FUTUREUNI's free mini-audit. The headless-browser capture runtime (`@/platform/browser`, ADR-017) with
four runtimes (`vercel-sandbox` primary, `serverless-chromium` fallback, `local-playwright` dev, `mock`
tests), safety enforced in code (SSRF + robots before every capture, navigation-only actions, 20s
timeout, one context per capture), and screenshots stored privately as WebP with retention. The audit
engine (`@/modules/acquisition/audits`) runs each service line's agent (`audit.web`, `audit.uiux`,
`audit.graphic`, `audit.video`) over 24 checks, produces evidence-backed findings (INV-18), moves the
lead `ENRICHED → AUDITING → AUDITED` (or rebounds to `ENRICHED` and flags after N required failures),
caches domain-level results for 7 days, and stops at a per-lead cost cap. Six AI tasks add vision and
text judgements with evidence-reference validation (INV-24, contract rule 3). Meets AC-12.1–12.5 and
US-13 (verified by integration tests).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/platform/browser/{index,capture,safety,screenshot-store,capture-worker,worker-source,remote,types}.ts` | Capture runtime, safety gate, WebP storage, shared Playwright worker, remote protocol |
| `src/platform/browser/runtimes/{mock,local-playwright,vercel-sandbox,serverless-chromium}.ts` | The four runtimes |
| `src/platform/browser/{safety,capture}.test.ts` | Safety + capture tests |
| `src/modules/acquisition/audits/orchestration/{run-audits,context,cost-meter,cache}.ts` | `runAudits`, DI context, cost cap, domain cache |
| `src/modules/acquisition/audits/agents/{registry,support,factory,web,uiux,graphic,video}.ts` | The four agents + runner |
| `src/modules/acquisition/audits/checks/{web,uiux,graphic,video,html,tls,fetch-image,capture-helpers,cost,types}.ts` | Per-line checks + shared helpers |
| `src/modules/acquisition/audits/claims/templates.ts` | Deterministic claim templates |
| `src/modules/acquisition/audits/providers/{pagespeed,youtube,app-store}/{index,real,mock}.ts` | Data providers (real + mock) |
| `src/modules/acquisition/audits/ai/{schemas,validate-refs,run}.ts` | AI task schemas, ref validation, shared AI-findings path |
| `src/modules/acquisition/audits/{audit.repo,services,jobs,settings,config,tasks,index}.ts` | Repo, services, jobs, settings, tasks, barrel |
| `src/modules/acquisition/audits/**/*.test.ts` | Unit + integration tests (11 files) |
| `runtime-skills/acquisition/audit-*/SKILL.md` | 6 AI task skills |
| `evals/acquisition/audit-*/{cases/*.json,fixtures/mock.json}` | 6 eval suites (48 cases) |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/audits
export async function runAudits(input: { leadId: string; actor: Actor; jobRunId?: string; force?: boolean; now?: () => Date; signal?: AbortSignal; log?: AuditLogger }): Promise<RunAuditsResult>;
export async function getAuditsForLead(actor: Actor, leadId: string): Promise<AuditView[]>;   // acquisition.lead.read
export async function getFinding(actor: Actor, findingId: string): Promise<FindingView>;       // acquisition.lead.read; signed artifact URL
export async function rerunAudit(actor: Actor, leadId: string): Promise<RunAuditsResult>;      // acquisition.lead.reaudit; audited
export async function dismissFinding(actor: Actor, findingId: string, reason: string): Promise<void>; // acquisition.finding.dismiss; audited; INV-18
export const auditJobs;      // acquisition.audits.lead | batch | refresh  (Phase 19 registers)
export const auditSettings;  // acquisition.audits.*                        (Phase 19 registers)
export const auditTasks;     // 6 AI tasks                                   (Phase 19 registers)

// @/platform/browser
export const capture: Capture;  // (req) => Promise<CaptureResult>; safety-gated, runtime-selected
```

- **Events emitted:** `audit.completed` (`{ leadId, auditIds, status, findingCount, pitchableCount }`),
  `finding.dismissed` (`{ findingId, leadId }`), `lead.needsAttention` (on required-failure flag).
- **Lead transitions owned:** `ENRICHED→AUDITING`, `AUDITING→AUDITED`, `AUDITING→ENRICHED`.
- **AI tasks:** `acquisition.audit-web-first-impression`, `-uiux-review-analysis`, `-uiux-heuristics`,
  `-graphic-consistency`, `-video-thumbnails`, `-video-titles`.

## Decisions made (and any new ADRs proposed)

- **Required-failure handling:** on a failed required check the lead rebounds `AUDITING→ENRICHED`
  (so the batch job re-picks it) and `auditFailureCount` increments; at `maxRequiredFailures` (default 3)
  it stays `ENRICHED`, sets `needsAttentionAt`, and emits `lead.needsAttention`. The batch job skips
  leads at/above the max. (Interpretation of the spec's "retry then flag"; AC-12.4 verified.)
- **`audits.lead` job is `kind: "single"`** with idempotent per-agent execution (prior uncited audits
  cleared before each run) rather than a Workflow — simpler and equally resumable.
- **WebP** via `sharp`, lazy-imported only in the capture path (no main-bundle impact).
- **`vercel-sandbox`** returns screenshot bytes to the app, which stores them once through
  `@/platform/storage` (a single retention/FileObject path), rather than uploading to Blob inside the
  sandbox as ADR-017 sketches — functionally equivalent.

## Dependencies added

| Package | Version | Why |
|---|---|---|
| `sharp` | ^0.35.5 | PNG→WebP screenshot conversion (lazy-imported in the capture path) |
| `@vercel/sandbox` | ^3.5.1 | ADR-017 primary browser runtime |
| `playwright-core` | ^1.63.0 | Capture engine for `local-playwright` + Playwright types |

None has an install/postinstall script, so no `pnpm-workspace.yaml` `allowBuilds` change is needed.

## Change requests raised

See `phases/10/REQUESTS.md`:
- **CR-10-01** (manifest): register `auditJobs`/`auditSettings`/`auditTasks` on the acquisition manifest.
- **CR-10-02** (schedule): `audits.batch` ~every 10 min, `audits.refresh` daily.
- **CR-10-03** (setting): register `platform.retention.screenshotsDays` (default 90) as a platform setting.
- **CR-10-04** (dependency): sharp, @vercel/sandbox, playwright-core.
- **CR-10-05** (contract, non-blocking): `AuditContext` lacks `actor` (AI calls use a SYSTEM actor) and a
  full configured-check set (agents run all checks; profiles gate only via required flags).
- **CR-10-06** (pre-existing): `src/platform/ai/registry.ts` unused `DefineTask` import fails `eslint .`
  — inherited from the branch point; `main` already fixes it uncommitted; guard forbids editing it here.

**Seams:** both **real** (providers already merged on `main`) — SEAM-PROFILE (`getActiveProfile`,
Phase 7) and SEAM-SAFE-FETCH (`safeFetch`/`guardUrl`/`isAllowedByRobots`, Phase 9). No stand-ins written;
`grep -r "SEAM:" src` returns nothing for Phase 10.

## Known limitations

- `vercel-sandbox` and `serverless-chromium` are implemented to ADR-017/SDK docs but **not runtime-verified**
  here (need a deployed snapshot / separate project + Vercel OIDC). `mock` and `local-playwright` are the
  runnable paths; `mock` is used by all tests.
- No live check ran (no real API keys); costs below are from the mock estimates.
- `graphic.logo_quality` and brand-image downloads are `NOT_ASSESSED` under `MOCKS` (no real network in
  tests); they run against real images only when `MOCKS=false`.
- Google Play reviews are intentionally **not** collected (no compliant public API); Instagram/TikTok are
  `NOT_ASSESSED` (INV-14).
- Evals are authored (6 suites, 48 cases) and structurally verified, but run only once the tasks are
  registered on the manifest (Phase 19) — `pnpm evals` can't resolve them in this worktree.

## Estimated cost per audit (mock estimates; per-lead cap default $0.15)

| Line | Dominant costs | Rough per-lead |
|---|---|---|
| Web (with site) | 2–4 captures (~$0.002 each) + first-impression vision (~$0.015); PSI free | ~$0.02 |
| Web (no site) | `no_website` only | ~$0.00 |
| UI/UX | onboarding + a11y captures (~$0.006) + heuristics vision (~$0.015) + review text (~$0.003) | ~$0.025 |
| Graphic | brand-surface capture (~$0.002) + consistency vision (~$0.015) | ~$0.017 |
| Video | YouTube free + thumbnails vision (~$0.015) + titles text (~$0.003) | ~$0.018 |

## How to test it

- `pnpm test` (whole suite, 834) or scoped: `npx vitest run src/modules/acquisition/audits src/platform/browser` (50 tests).
- Integration tests seed a company + `ENRICHED` lead + active profile and call `runAudits` against the
  real test DB with `MOCKS=true`; see `src/modules/acquisition/audits/orchestration/run-audits.test.ts`.
- A real local capture can be proven with `BROWSER_RUNTIME=local-playwright` (Edge channel or
  `CHROMIUM_EXECUTABLE_PATH`); tests use `BROWSER_RUNTIME=mock`.
- PostgreSQL must be running (`pnpm db:up`).
