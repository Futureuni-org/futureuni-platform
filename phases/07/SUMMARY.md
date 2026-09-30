# Phase 07: Profiles and runtime skills — Summary

| | |
|---|---|
| Phase | 07, Profiles and runtime skills |
| Branch | `phase/07-profiles` |
| Batch / wave | B2 / Wave 2 |
| Date finished | 2026-09-30 |
| Prompt | `docs/prompts/wave-2/phase-07-profiles.md` |
| Verification | `pnpm check`: Pass · `pnpm test:e2e`: Not applicable (no UI) · `saas-review`: not yet run |

## What was built

`@/modules/acquisition/profiles` is the platform's single source of truth for what FUTUREUNI sells on each service line, per market — pricing packages, portfolio items, pitch angles, delivery lead-times, approval mode and every runtime reference the outreach AI tasks read at generation time. Phase 7 delivers:

- The **read + write repo** over `ServiceLineProfileVersion` (drafts, publish, rollback; INV-16 "exactly one active version per service line" is enforced in one transaction).
- A **Zod validator** with structured errors that Phase 18's profile editor will surface.
- **Resolvers** that select the right pitch angle, portfolio slice, pricing package and runtime references for a given market/line/pitch — the primary read path for outreach.
- **Defaults** for all four service lines (web development, UI/UX design, graphic design, video editing) so seed data reflects a plausible FUTUREUNI offer without hand-authoring in the DB.
- **Runtime skills** under `runtime-skills/acquisition/_references/` (evidence rules, services catalogue, per-line reference docs, per-market voice references).
- The **profile-sanity eval task** (registered under `evals/acquisition/profile-sanity/`), which proves the runtime references keep AI openers truthful.
- A **diff helper** so Phase 18's version-history screen can render side-by-side changes.
- A **line-owners helper** that reads `TeamProfile.serviceLines` to answer "who owns this line right now" (used by Phase 11 capacity and by Phase 18's admin UI).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/modules/acquisition/profiles/index.ts` | Public API barrel. |
| `src/modules/acquisition/profiles/read.repo.ts` | `getActiveProfile`, `listActiveProfiles`, `getProfileVersion`, `listProfileVersions`, `getDraft` (SEAM-PROFILE surface). |
| `src/modules/acquisition/profiles/write.ts` | `saveDraft`, `publishProfile`, `rollbackProfile` — INV-16 enforced. |
| `src/modules/acquisition/profiles/validate.ts` + `.test.ts` | Zod-based validation, structured error output. |
| `src/modules/acquisition/profiles/resolve.ts` + `.test.ts` | `resolvePitchAngle`, `resolvePortfolio`, `getPricingForLine`, `selectAcquisitionReferences`. |
| `src/modules/acquisition/profiles/diff.ts` | Deep-diff for the version-history UI. |
| `src/modules/acquisition/profiles/owners.ts` | `getLineOwners()` reader. |
| `src/modules/acquisition/profiles/check.ts` | The `pnpm profiles:check` script entrypoint (see REQUESTS.md CR-07-01). |
| `src/modules/acquisition/profiles/seed.ts` | Idempotent seeder: reads `DEFAULT_PROFILES`, publishes v1 per line. |
| `src/modules/acquisition/profiles/settings.ts` | `profilesSettings` (empty in Wave 1; the shape is here for Phase 19's manifest merge). |
| `src/modules/acquisition/profiles/tasks.ts` | `profilesAiTasks` — currently `profileSanityTask` only (eval-only). |
| `src/modules/acquisition/profiles/defaults/**` | `web-development.ts`, `ui-ux-design.ts`, `graphic-design.ts`, `video-editing.ts`, `shared.ts`, `index.ts` + `.test.ts`. |
| `runtime-skills/acquisition/_references/evidence-rules.md` | INV-5 language rules AI outreach must follow. |
| `runtime-skills/acquisition/_references/services-catalogue.md` | Product-side reference the AI tasks quote from. |
| `runtime-skills/acquisition/_references/lines/{web-development,ui-ux-design,graphic-design,video-editing}.md` | Line-specific voice + facts. |
| `runtime-skills/acquisition/_references/markets/{nigeria,international}.md` | Market-specific voice. |
| `evals/acquisition/profiles/README.md` + `evals/acquisition/profile-sanity/**` | The eval suite for `acquisition.profile-sanity`, with fixtures. |
| `phases/07/{SUMMARY,REQUESTS}.md` | Phase docs. |

## Public interfaces other phases can use

```ts
// @/modules/acquisition/profiles — the SEAM-PROFILE surface + everything Phases 8/9/10/11/12/14 read.

// Reads (SEAM-PROFILE):
export function getActiveProfile(line: ServiceLine): Promise<ServiceLineProfile | null>;
export function listActiveProfiles(): Promise<ServiceLineProfile[]>;
export function getProfileVersion(id: Id): Promise<PublicVersionRow | null>;
export function listProfileVersions(line: ServiceLine, opts?: { limit?: number }): Promise<PublicVersionRow[]>;
export function getDraft(line: ServiceLine): Promise<ServiceLineProfile | null>;

// Writes (Phase 18 admin surface):
export function saveDraft(actor: Actor, line: ServiceLine, patch: ProfileDraft): Promise<PublicVersionRow>;
export function publishProfile(actor: Actor, line: ServiceLine): Promise<PublicVersionRow>;
export function rollbackProfile(actor: Actor, versionId: Id): Promise<PublicVersionRow>;

// Validation + resolvers used by outreach (Phases 11–14):
export function validateProfile(profile: unknown): { valid: boolean; errors: ValidationError[] };
export function resolvePitchAngle(profile, { pitchAngleId }): PitchAngle | null;
export function resolvePortfolio(profile, { count, market }): PortfolioItem[];
export function getPricingForLine(profile, packageId): PricingPackage | null;
export function selectAcquisitionReferences(profile, { market, pitchAngle }): { path: string; optional?: boolean }[];

// Diff (Phase 18):
export function diffProfiles(before, after): ProfileDiff;

// Ownership:
export function getLineOwners(line: ServiceLine): Promise<LineOwner[]>;

// Manifest inputs (Phase 19 wires them in):
export const profilesSettings: readonly SettingDefinition[]; // empty today
export const profilesAiTasks: readonly AnyTaskDefinition[]; // [profileSanityTask]
```

## Decisions made

- **Defaults live in code.** `DEFAULT_PROFILES` in `defaults/index.ts` is the seed source. Reasoning: profiles change slowly and are audited in git — safer than editing them via the admin UI and losing traceability.
- **Runtime references are Markdown**, not JSON. Reasoning: AI tasks compose them into system prompts; Markdown lets voice + evidence rules live next to each other and keeps the diff readable.
- **`profile-sanity` is eval-only.** It never runs in the outreach path; it's exercised by `evals/acquisition/profile-sanity/**` on every prompt-version publish for tasks that read the profile.
- **`INV-16` — exactly one active version per line** — enforced by `publishProfile` and `rollbackProfile` in a single Prisma transaction that flips the previous active row to `ARCHIVED` and marks the new row `PUBLISHED`.

## Dependencies added

None. Every dep the phase needs (`zod`, `@/platform/db`, `@/platform/auth`, `@/platform/audit-log`) was already installed by earlier phases.

## Change requests raised

See `phases/07/REQUESTS.md` for details. Highlights:

- **CR-07-01** · add `"profiles:check": "tsx src/modules/acquisition/profiles/check.ts"` to `package.json` scripts (Phase 1).
- **CR-07-02** · Phase 19 registers `profilesAiTasks` and `profilesSettings` on the acquisition manifest.
- **CR-07-03** · Phase 4 home widget registry maps `acquisition.review-queue`, `acquisition.inbox` and `acquisition.pipeline-value` to real acquisition service reads (Phase 4 currently ships placeholders that read seeded rows directly).
- **CR-07-04** · Phase 8 uses `getPricingForLine` / `resolvePortfolio` when materialising leads.
- **CR-07-05** · Phase 9 wires `SEAM-PROFILE` to `getActiveProfile` / `listActiveProfiles` from this module at merge (this is the integration step for B2).

## Known limitations

- No **profile editor UI** — Phase 18 builds it on top of the services here.
- **`profile-sanity` isn't executed as part of `pnpm check`** — it needs an AI provider (mock or real). Phase 19's eval CI wires it in.
- **`profilesSettings` is empty**; if a future edit needs a profile-scoped setting, add it to `settings.ts` and REQUESTS.md.

## How to test it

```bash
pnpm install
pnpm db:generate
pnpm db:seed             # seeds v1 of every line's default profile
pnpm check               # lint + typecheck + tests (validate + resolve + defaults) + build
pnpm profiles:check      # after CR-07-01 is applied — sanity-checks the runtime references
```
