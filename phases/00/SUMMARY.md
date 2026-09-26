# Phase 00: Requirements pack: Summary

| | |
|---|---|
| Phase | 00, Requirements pack |
| Branch | `main` (the repository was created in this phase; committed directly on request) |
| Batch / wave | B0 / Wave 0 |
| Date finished | 2026-09-25 |
| Prompt | `docs/prompts/phase-00-requirements.md` (plus the owner's "Running phase prompts" instruction from `docs/prompts/RUN-GUIDE.md` §4, B0) |
| Verification | No application code in this phase. Document self-checks, an independent review and a verification pass: see "Final self-check" below |

## What was built

The complete requirements pack that Phases 1–21 build against. It has no application code.
- **Specs:** the platform spec, the Client Acquisition module spec and the field-level data model.
- **Rules:** `.claude/project-rules.md`, with brand tokens and computed contrast ratios, the full permission matrix, 25 numbered domain invariants, bans and output rules.
- **`CLAUDE.md`:** the phase protocol, a new **"Running phase prompts"** section, the complete ownership map and conventions.
- **12 contract files**, with TypeScript and Zod 4 code, rules and worked examples.
- **34 ADRs**, researched where the brief asked.
- **Integrations:** a register with verified pricing and terms, `.env.example`, and `.mcp.json` with six build-time MCP servers.
- **Phase index:** `phases/README.md` with the wave table and the RUN-GUIDE batch table.

**Repository housekeeping, as the owner chose:**
- `git init -b main`.
- The prompt folders were renamed `WAVE-N` → `wave-N`, as RUN-GUIDE §1 asks.
- `RUN-GUIDE.md` moved into `docs/prompts/`, and the newer root copy of the build roadmap replaced the older one there.
- The Python lead-gen roadmap and the Growth Engine `.docx`/`.pdf` moved to `docs/background/`, with the stray space dropped from the PDF name.

## Files and folders created

| Path | Purpose |
|---|---|
| `CLAUDE.md` | What the repo is, the read-first list, the phase protocol, **Running phase prompts** (prompt resolution, RUN-GUIDE batches, the seam rule, finishing), the ownership map (every phase's paths, including later Part A1 additions), conventions, skill pointers, and the empty `saas-skills` marker block |
| `.claude/project-rules.md` | saas-setup's 8 sections. Brand and UI: semantic tokens in light and dark, with an AA contrast ratio for every pair. The permission matrix: about 90 `module.resource.verb` actions × 4 roles, with scope codes. INV-1…INV-25, bans, and output rules (₦ $ £ €, dates, proposal and brief structure) |
| `docs/specs/platform.md` | Platform core spec: roles, team profile, capabilities, module system, platform home, route map, API surface, screen states, non-goals, risks, and milestones P1–P21 (24 stories, 90 criteria, 33 milestone criteria) |
| `docs/specs/module-acquisition.md` | Client Acquisition spec: flow, tabs and sections, four concrete initial profiles, markets, provider terms (§3.5.1), the **lead lifecycle transitions table (the source of truth)**, scoring, cross-sell, throttling, outreach, inbox, pipeline, analytics, route map, screen states, and the **phase-to-milestone map M7–M19** with numbered acceptance criteria (44 stories, 176 criteria, 102 milestone criteria) |
| `docs/specs/data-model.md` | 63 entities (27 core, 36 acquisition), all enums, Mermaid ERDs, one table per entity, 29 raw-SQL constraints, the personal-data map, the typed-JSON map, coverage and the seed plan |
| `docs/contracts/*.md` | `common`, `module-manifest`, `service-line-profile`, `source-adapter`, `enrichment`, `audit-agent`, `ai-service`, `jobs`, `outreach-channel`, `permissions`, `events`, `acquisition-records` |
| `docs/decisions.md` | ADR-001–012 (fixed) plus ADR-013–034 |
| `docs/integrations.md` | Services register (purpose, phase, adapter, mock, free tier, pricing, signup, go-live need), the terms that shape the design, credential names, go-live order, MCP servers, and the items still to verify |
| `.env.example` | Every variable, grouped by service, placeholders only (`MOCKS="true"`, the AI model tiers, the credentials encryption key and other secrets) |
| `.mcp.json` | Prisma (`prisma@7 mcp`), Playwright, Context7, GitHub (remote, PAT from env), Vercel, and Neon (both remote, OAuth) |
| `.gitignore` | Next.js, Prisma (including the generated client), env files, `.storage/`, Workflow data, Playwright MCP output, eval reports |
| `phases/README.md` | The wave table, the **RUN-GUIDE batch table (B0–B7)**, dependencies and seams per phase, worktree commands, the merge procedure, and "Completed phases" |
| `phases/SUMMARY_TEMPLATE.md` | The template every phase uses |

## Public interfaces other phases can use

This phase defines documents, not code. What later phases rely on:
- **Names:** every enum, event, job, AI task ID, setting key, permission action, route, error code, adapter ID and audit check ID. They're defined in `docs/specs/data-model.md` §3, `docs/contracts/*`, `.claude/project-rules.md` and `docs/specs/module-acquisition.md` §3.15–3.16. Never invent a synonym (CLAUDE.md conventions).
- **Lead lifecycle:** `docs/specs/module-acquisition.md` §5.2 is the only allowed-transitions table, and Phase 2 implements it exactly (INV-15).
- **Contracts:** Phase 2 turns `docs/contracts/*.md` into `src/contracts/*.ts` without redesigning them. `common.md` holds the shared primitives. `acquisition-records.md` holds the typed JSON shapes for meetings, proposals, handoffs and replies.
- **Ownership:** the `CLAUDE.md` ownership map is the input for Phase 1's `scripts/ownership/ownership.json`. The most specific pattern wins, and the grants table lists `alsoAllow` entries.
- **Execution:** the batches, seam rule and merge procedure are in `phases/README.md` and `CLAUDE.md` §"Running phase prompts".

## Decisions made (and any new ADRs proposed)

**ADRs written in this phase:**

| ADR | Decision |
|---|---|
| ADR-013 | Better Auth 1.7.x |
| ADR-014 | Bricolage Grotesque + Instrument Sans + JetBrains Mono |
| ADR-015 | 12-month personal-data retention |
| ADR-016 | Google Workspace in a **dedicated outreach tenant** + Gmail API (Internal OAuth app), polling `history.list`, no warm-up pools |
| ADR-017 | Vercel Sandbox browser runtime, with `@sparticuz/chromium` in a secret-free project as fallback |
| ADR-018 | AI tiers fast/balanced/deep = `claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5` by config. Haiku 4.5 may retire from 15 Oct 2026; Phase 5 re-checks |
| ADR-019 | Prisma 7 pinned (`prisma@latest` is the 8.0 RC), `@prisma/adapter-pg` everywhere, `prisma.config.ts` |
| ADR-020 | Hunter |
| ADR-021 | Cal.com with a hidden `leadRef` question |
| ADR-022 | `@react-pdf/renderer` |
| ADR-023 | Resend for transactional email only |
| ADR-024 | pnpm on Node 24 |
| ADR-025 | Batches and the seam rule |
| ADR-026 | Complete ownership map |
| ADR-027 | Internal costs in integer micro-USD |
| ADR-028 | `runTask` is the AI entry point |
| ADR-029 | Milestones map to phases |
| ADR-030 | Sentry |
| ADR-031 | No open tracking |
| ADR-032 | INV-9 index covers ACTIVE and PAUSED enrolments |
| ADR-033 | `vercel.json` |
| ADR-034 | Compliance posture pending legal review |

**Decisions later phases should know about:**
- **Google Places content isn't stored.** Only `place_id` is persisted (Maps Platform terms), and display fields are fetched live (module spec §3.5.1).
- **Job-board sources:** Adzuna and Jobberman are disabled by default because of their terms. MyJobMag is fed only from its public XML feeds.
- **Nigeria is held for review** by default: NDPC GAID 2025 Art. 18 requires consent for any direct marketing (ADR-034, INV-25, OQ-10).
- **Compliance hold, not disqualification:** a lead whose email is `REVIEW` or `CONSENT_REQUIRED` and has no assisted channel waits in `NURTURE` with reason `COMPLIANCE`, and is released when the verdict changes. `DISQUALIFIED` with `no_channel` applies only when email is `BLOCKED`. `complianceReview` is defined once, in project-rules.
- **INV-3 stops by company** (`stopEnrollments({ companyId })`). Only an out-of-office auto-reply pauses. `acquisition.unsubscribeScope` sets only how wide the suppression is.
- **Admin access:** the new action `platform.admin.access` (ADMIN, MANAGER) gates `/admin`. SERVICE_LEADs see every service-line tab read-only outside their lines; MEMBERs see only their own lines.
- **Navigation adds a "Leads" section** (wave-4 route R-A9), and a query-parameter table fixes cross-screen links for Phases 15–17. These are deliberate supersets of Phases 2 and 15's lists.
- **Signals:** each adapter's emitted `signalType` IDs are fixed in `docs/contracts/source-adapter.md` (`app_low_rating` and `app_reviews_usability_complaints` supersede Phase 8's example names). Manual and CSV signals use `manual_lead`, and enrichment and audit signals are derived (`detectedBy`).
- **Contracts go further than the phase prompts where research demanded it:** the scoring conditions are a structured AST with a canonical text form, so Phase 11 needs no parser. A `SuppressionReason` `OBJECTION` and a `SuppressionSource` `PROVIDER_SIGNAL` were added for Hunter's 451 `claimed_email` signal. `Mailbox.warmupRampDays` was added.

**Skills check (Step 1):**
- All eleven required global skills exist in `~/.claude/skills/`: saas-plan, saas-setup, saas-ui, saas-data, saas-auth, saas-api, saas-testing, saas-review, saas-ship, saas-notify, saas-ai. saas-billing is also installed and unused.
- Every `SKILL.md` was read; saas-plan led this phase.
- One deliberate deviation from saas-plan: milestones map to build phases, not vertical slices (ADR-029).
- `.claude/project-rules.md` was written with saas-setup's section template. `CLAUDE.md` ends with an empty `<!-- saas-skills:start -->`/`<!-- saas-skills:end -->` pair for Phase 1.

## Dependencies added

None (no code).

## Change requests raised

None. Phase 0 owns every file it wrote. **Seams:** none (Phase 0 has no seams).

Notes for the first merge-time sessions:
- **Phase 2:** the development seed creates version 1 of each profile with `note = "seed:placeholder"`, which Phase 7's seeder may supersede (M7-AC6). Better Auth's own table fields win over `data-model.md` (library `role` is a string, so it's mapped to our enum; IDs come from `cuid()`). The contracts import enums from `@/generated/prisma/enums` (Prisma 7 generator); confirm the path.
- **Phase 3:** exclude `.well-known/workflow/` from the `src/proxy.ts` matcher (Vercel Workflow requirement, ADR-003).

## Known limitations

- **Docker isn't installed on the build laptop** (checked 2026-09-25). **Resolved 2026-09-26:** native PostgreSQL 18.6 runs on `localhost:5432` with `futureuni_dev` and `futureuni_test` created, and Phase 1 builds a native mode for `db:up`/`db:down` and `pnpm phase start` (ADR-004 amendment).
- **Logo:** only `docs/brand/futureuni-logo.png` exists: a violet "S" mark, 411×533 PNG, slightly soft, with no wordmark, no SVG and no dark variant. The wordmark is rendered as live text until files arrive.
- **Placeholders:** every price in the initial profiles is a placeholder (`needsReview: true`, "Prince to confirm"). Portfolio items are placeholders (`isPlaceholder: true`). The postal address is empty in production, which blocks sends (INV-4).
- **Not legal advice:** the country rules, PECR/NDPA/GAID handling and retention need qualified review before launch (ADR-034, Phase 20/21 gates).
- **Items marked "verify":** listed in `docs/integrations.md` §6, each with the phase that owns the check.

## How to test it

Documents only. To reproduce the Phase 0 self-checks:
1. **Ownership:** parse the `CLAUDE.md` ownership table and confirm no path is claimed twice. Also check that every path a phase prompt lists under "What you own", and every Part A1 path, resolves to that phase under the most-specific rule. The scratch script used is described under "Final self-check".
2. **`.mcp.json`:** it parses as JSON. It and `.env.example` contain no secret-like values.
3. **References:** every `ADR-0nn` and `INV-n` reference resolves.
4. Read `docs/specs/data-model.md` §9 (coverage) against the spec sections it cites.

## Final self-check

**"Done when" (Phase 0 prompt):**

- [x] `docs/specs/platform.md`, `docs/specs/module-acquisition.md` and `docs/specs/data-model.md` exist and meet Steps 3 and 7.
- [x] `.claude/project-rules.md` has all 8 sections, the token table with contrast ratios (45 pairs, every one passing its AA target, recomputed independently), the full permission matrix, INV-1…INV-25 and the bans.
- [x] `CLAUDE.md` (133 lines) has the read-first list, the phase protocol, the **Running phase prompts** section, the ownership map, conventions, skill pointers, and the empty saas-skills marker block at the end.
- [x] `docs/contracts/` holds all ten required contracts, plus `common.md` and `acquisition-records.md`. Each has types, rules, a worked example and an invalid example. The code blocks were compiled in a scratch project against Zod 4.6.5 and TypeScript strict (with `exactOptionalPropertyTypes` and `noUnusedLocals`). The build was clean: every worked example parses, and every invalid example fails at its stated path.
- [x] `docs/decisions.md` holds ADR-001–012 plus the researched ADRs: cold-outreach sending (016), headless browser (017), auth library (013), retention (015) and font pairing (014). Supporting ADRs 018–034 are also there.
- [x] `docs/integrations.md` and `.env.example` exist. `.mcp.json` is valid JSON, and a scan of it and `.env.example` found no secret-like values.
- [x] `phases/README.md`, `phases/SUMMARY_TEMPLATE.md` and this file exist.

**The four required checks:**

| Check | Result |
|---|---|
| Every entity in the data model is used by at least one spec section | **Pass.** All 63 entities are mapped in `data-model.md` §9 to numbered sections of `platform.md` or `module-acquisition.md`. The independent reviewer confirmed every cited section exists and covers the entity |
| Every contract type is referenced by the data model or a spec | **Pass**, after fixes. The review found three orphans: `"screenshot-api"` (rejected by ADR-017), `"apollo"` (ADR-020 chose Hunter) and an unmapped `PROHIBITED` rule. All three were removed or mapped. Typed-JSON types are cross-referenced in `data-model.md` §7 |
| Every path in the ownership map has exactly one owner | **Pass.** 171 path patterns, 0 duplicates; the most specific pattern wins, and `alsoAllow` grants are listed separately. Every path a phase prompt lists under "What you own", and every wave Part A1 path, resolves to that phase. The only exceptions are intentional: Phase 5's `evals/**` is narrowed per wave-2 A1, and a few paths are mentioned in prompts without being claimed |
| Every domain invariant is testable | **Pass**, after fixes. INV-3 (stop scope, and the out-of-office exception), INV-5 (scope: AI drafts versus human-confirmed text), INV-14 (observable rules: `termsUrl`, disabled adapters, robots, no login credentials, Places storage) and INV-24 (a named delimiter format) were reworded. Each invariant now names an observable pass or fail condition. Phase 20 maps each one to its enforcing code and tests |

**Independent review:**
- A separate reviewer audited the whole pack against every later phase prompt. It found **1 Critical, about 22 Major and a set of Minor issues**.
- **The Critical issue:** Nigerian and email-only leads under review could be permanently disqualified. It's now a `NURTURE(COMPLIANCE)` hold, with a release path.
- **The Major issues:**
  - INV-3 contradicted the out-of-office pause.
  - Admin access and service-line tab visibility were inconsistent.
  - Several lifecycle transitions were missing.
  - Profile field names differed from the contract.
  - The notification-type registry didn't exist.
  - The retention purge was placed inside platform code.
  - Seam signature mismatches: SEAM-PERMISSION, SEAM-SEND-ONEOFF and `CurrentUser`.
  - Cross-screen query parameters were missing.
  - A Leads navigation entry was missing.
  - The jobs contract example was typed wrongly.
- All were fixed in one planned pass, with one owner per file group.
- A second verifier confirmed all 14 fix groups resolved. It then found 2 Major regressions, which are now fixed:
  - Held Nigerian leads couldn't be released when the legal-basis setting changes. That's now `acquisition.compliance.reevaluate` on `settings.changed`.
  - A compliance-disqualification row was undefined. It's now defined narrowly: a `PROHIBITED` rule with no assisted channel.
- The verifier also found 11 Minor or Low regressions, all fixed:
  - `nurtureLead` restricted to post-contact statuses
  - four missing notification types added
  - Search navigation gated on `search.read`
  - service-lead settings made read-only
  - the capacity banner link
  - working-hours editing
  - the `browser` provider ID
  - the profile field renamed `detectingSources`
  - the event naming convention
  - `complianceReview` owned by Phase 9
  - Nigeria's legitimate-interest basis limited to incorporated bodies

## Things Prince must do by hand

**Before Phase 1:**
1. ~~**Install Docker Desktop**~~ Done differently on 2026-09-26: native PostgreSQL 18 instead (ADR-004 amendment).

**Brand and business facts:**

2. Send an **SVG logo**, an official **wordmark** (if one exists) and a **dark-background variant**. Place them in `docs/brand/`. *2026-09-26: vector drafts of all three are in `docs/brand/drafts/`; approve or replace them (`docs/owner-inputs/README.md` item 2).*
3. Supply **FUTUREUNI's postal address** for the outreach footer (`platform.postalAddress`, INV-4). No real outreach is sent until it's set. *Still waiting (item 1).*
4. Confirm the **pricing** placeholders (Phase 7 lists every figure), provide **real portfolio items**, and decide the sector lists (churches, government bodies). *2026-09-26: fill in `docs/owner-inputs/pricing-and-portfolio.md`.*

**Legal (Phase 20/21 launch gates):**

5. Get **Nigerian counsel's written view on GAID 2025 Art. 18 and 26**: may FUTUREUNI cold-contact Nigerian businesses on legitimate interest, and does GAID reach its non-Nigerian outreach? Also get a general legal review of the country rules and the retention period. *2026-09-26: the pack for counsel is in `docs/legal/` (not legal advice; start with its README).*

**Accounts and tokens.** No keys are needed until Phase 21. Create these accounts as company-owned, not personal:

6. **Accounts:**
   - Vercel Pro, then Neon and Blob through Vercel
   - Anthropic (with a spend limit)
   - a Google Cloud project with API key restrictions and a budget alert, for Places, PageSpeed and YouTube
   - SerpApi, Hunter, Companies House, Resend and Cal.com
   - a **dedicated Google Workspace tenant for outreach**, plus 2–3 outreach domains and the platform mail subdomain
   - Sentry
   - a team password manager, which holds `CREDENTIALS_ENCRYPTION_KEY` and the 2FA recovery codes
7. Optionally, email MyJobMag (services@myjobmag.com) to confirm feed use, and decide whether to license Adzuna (default: no).

**MCP servers (when you next launch Claude Code in this repo):**

8. ~~Approve the project servers from `.mcp.json`~~ (approved 2026-09-26 in `.claude/settings.local.json`), then run `/mcp` to sign in to **Vercel** and **Neon**.
9. When the repo is on GitHub, create a **fine-grained PAT** for this repository and run `setx GITHUB_MCP_PAT "…"`.
10. Optionally, get a Context7 key; see `docs/integrations.md` §5.

## Open questions (each with its suggested default)

Each default is already built into the pack, so none of these blocks Phase 1.

| # | Question | Owner | Default used |
|---|---|---|---|
| 1 | SVG logo, wordmark and dark variant? (platform OQ-1) | Prince | The PNG mark on both themes, plus a live-text wordmark |
| 2 | Registered postal address for email footers? (platform OQ-2) | Prince | Empty in production, which blocks outreach sends until it's set |
| 3 | When should compliance services move to the platform core? (platform OQ-3) | Lead engineer | When a second module that contacts people is specified |
| 4 | Who are the first two admins? (platform OQ-4) | Prince | Prince plus the lead engineer, both with 2FA |
| 5 | Should Google sign-in be enabled? (platform OQ-5) | Prince | Off (`AUTH_GOOGLE_ENABLED=false`) |
| 6 | How long is the audit log kept? (platform OQ-6) | Prince | Kept indefinitely |
| 7 | Real package prices per line and market? (module OQ-1) | Prince | Placeholders with `needsReview: true`; no prices quoted until cleared |
| 8 | Real portfolio items? (module OQ-2) | Prince | Placeholders, never attached (INV-19) |
| 9 | Outreach domain names and sender identities? (module OQ-3) | Prince | 2–3 brand-variant domains, 1–2 real staff senders each (Phase 21) |
| 10 | Quote eurozone prospects in EUR? (module OQ-4) | Prince | USD until EUR ranges exist |
| 11 | Target sectors and cities beyond the defaults? (module OQ-5) | Line leads | The module spec §3.3 lists, editable in the profile editor |
| 12 | Target churches, religious media and government bodies? (module OQ-6) | Prince | Churches and church media off; government bodies disqualified |
| 13 | Who owns new leads by default? (module OQ-7) | Managers | Unassigned until manual assignment or the first actionable reply |
| 14 | Nigerian VAT on proposals? (module OQ-8) | Prince | Tax off |
| 15 | Legal review of country rules, PECR/NDPA and retention? (module OQ-9) | Prince | Conservative rules, 12-month retention, launch blocked until reviewed |
| 16 | GAID Art. 18: may FUTUREUNI cold-contact Nigerian businesses? (module OQ-10) | Prince, with Nigerian counsel | `acquisition.compliance.ngDirectMarketingBasis = PENDING_LEGAL_REVIEW`: Nigerian email held for review, and every Nigerian first touch carries a compliance notice |
| 17 | License Adzuna, or partner with Jobberman? (module OQ-11) | Prince | No; both disabled, with SerpApi and MyJobMag feeds instead |
