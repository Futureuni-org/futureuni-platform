# Phase 0: Requirements Pack

> **How to run this phase**
> 1. Create an empty folder for the platform repository, for example `futureuni-platform/`.
> 2. Put this file at `docs/prompts/phase-00-requirements.md` inside that folder.
> 3. Put the FUTUREUNI logo files in `docs/brand/` (PNG or SVG, and a dark-background version if you have one).
> 4. Open Claude Code in the folder. Use Opus at maximum effort and switch to plan mode.
> 5. Say: **"Read docs/prompts/phase-00-requirements.md and execute it. Plan first."**
> 6. Review the plan, approve it, and let it build. When it finishes, check the "Done when" list at the bottom.
>
> Phase 0 runs alone. Nothing runs in parallel with it.

---

## Your role and the goal of this phase

You are the lead architect for the **FUTUREUNI Internal Platform**. FUTUREUNI is a digital services agency with four service lines: web development, UI/UX design, graphic design and video editing. The platform is a single internal web application that will hold every internal tool the company builds. The first tool (module) is **Client Acquisition**. It finds businesses that need FUTUREUNI's services, researches and audits them, scores them, runs compliant outreach, manages replies, and tracks deals through to won or lost.

**Phase 0 writes the requirements pack. It does not write application code.** You produce the specs, rules, contracts, data model and configuration that the 21 later phases build against. Many of those phases run in parallel, in separate terminals and separate git worktrees. They can only avoid clashing if this phase defines, unambiguously:

- who owns which folders
- what the shared data model is
- what every interface between parts looks like
- the rules everyone follows

Treat every document you write as a contract that another Claude Code session will read and obey without any other context. Be precise, concrete and complete. Where something is a genuine choice, make the decision, record it with its reason in the decisions log, and move on. Stop to ask me only if a decision can't be reversed and could reasonably go either way.

---

## Step 1: Check the environment and skills

1. Confirm these global skills exist in `~/.claude/skills/`: `saas-plan`, `saas-setup`, `saas-ui`, `saas-data`, `saas-auth`, `saas-api`, `saas-testing`, `saas-review`, `saas-ship`, `saas-notify`, `saas-ai`. Read the `SKILL.md` of each so the documents you write match their conventions and owners.
   - **saas-plan leads this phase.** Follow its spec workflow and templates.
   - saas-plan's shared contract says `.claude/project-rules.md` is created by `saas-setup`. In this project, Phase 0 writes the **first full version** of that file using saas-setup's section template. Phase 1 then runs `saas-setup`, which adopts and completes it.
   - Write `CLAUDE.md` so that saas-setup's marker block (`<!-- saas-skills:start -->` … `<!-- saas-skills:end -->`) can be inserted without duplicating anything you wrote.
   - If a skill is missing, say so in your summary and continue.
2. Run `git init` if the folder isn't a repository yet. Create a `.gitignore` suitable for Next.js, Prisma and env files.
3. Look in `docs/brand/` for logo files. Record their file names in project-rules. If there are none, record a TODO.

---

## Step 2: Fixed decisions (don't change these)

Record these in `docs/decisions.md` as **ADR-001 to ADR-012**, each with a one-line reason.

1. **Stack:**
   - Next.js (App Router, `src/` directory), TypeScript strict, Tailwind CSS
   - Prisma ORM, PostgreSQL, Zod for all validation
   - React Hook Form for forms, Motion (framer-motion) for animation, Lucide icons
   - The team is strongest in JavaScript/TypeScript, and knows Three.js if a 3D moment is ever justified
2. **Architecture: modular monolith.** One Next.js application, one database, one login, one deployment. Each internal tool is a **module** under `src/modules/<module-id>/` that registers itself with the platform through a manifest. Client Acquisition is `src/modules/acquisition/`. Future modules (for example Marketing) are added without touching the platform core.
3. **Hosting: Vercel Pro.**
   - Neon Postgres through the Vercel Marketplace
   - Vercel Blob for files
   - Vercel Workflow for multi-step and long-running background work
   - Vercel Cron for schedules
   - No separate servers or hosts
4. **Local development:** Docker Compose Postgres (or a Neon dev branch). A `.env.local` validated by a Zod env schema.
5. **Mock-first integrations.** Every external service is reached through an adapter interface with at least two implementations: `mock` (realistic fake data, no network) and the real provider. The implementation is chosen by env or settings. The entire platform must be buildable, testable and usable end to end with only mocks. Real keys are switched on in Phase 21.
6. **The Claude API is reached only through the platform AI service** (`src/platform/ai/`). No module calls the Anthropic SDK directly. Model names live in config, never in code.
7. **Runtime AI behaviour lives in runtime skill files** under `runtime-skills/`, loaded by the AI service. `CLAUDE.md` is for building only, never for runtime behaviour.
8. **Service lines:**

   | Enum value | Meaning |
   |---|---|
   | `WEB_DEVELOPMENT` | Web development |
   | `UI_UX_DESIGN` | UI/UX design |
   | `GRAPHIC_DESIGN` | Graphic design |
   | `VIDEO_EDITING` | Video editing |

   New lines are added by adding a profile, not by changing code paths.
9. **Markets:**
   - `NIGERIA` and `INTERNATIONAL`. A search can target one or both.
   - Every company, lead and message carries its market.
   - International leads also carry a country code (ISO 3166-1 alpha-2), because compliance rules differ by country.
10. **Channels:**
    - Email is the only channel the system may send automatically.
    - WhatsApp, LinkedIn and phone are **assisted**: the system prepares the message and a human sends it (WhatsApp uses a pre-filled `wa.me` click-to-chat link).
    - Nothing ever automates LinkedIn or sends unsolicited WhatsApp messages through an API.
11. **Theme:** the light theme is the default and is designed first. Dark mode is fully supported as a first-class theme, and users can switch.
12. **Parallel build protocol:** described in Step 5. It's mandatory for every phase.

---

## Step 3: Write the platform spec and the module spec (saas-plan)

Write both documents using saas-plan's project-spec template and acceptance-criteria rules.

### 3a. `docs/specs/platform.md`: the FUTUREUNI Internal Platform

It must cover:

- **Problem and goal:** one platform that holds every internal tool, on one host, with one login.
- **Users and roles.** Define exactly these four roles, with what each can see and do in the platform core:
  - `ADMIN`:
    - everything, including users, roles, settings, integrations, credentials, prompt versions and AI cost
    - can see all modules
  - `MANAGER`:
    - everything operational across all service lines
    - can approve outreach
    - can see all analytics
    - no credentials, no user role changes
  - `SERVICE_LEAD`:
    - scoped to one or more service lines
    - full operational rights inside those lines: search, review, approve, inbox, pipeline, proposals
    - read-only elsewhere
  - `MEMBER`:
    - works leads assigned to them
    - can draft but not approve outreach, unless given `canApprove`
    - sees analytics for their own service lines only
- **Team profile:** each user has one or more service lines, a weekly capacity (active projects they can take) and current load. Capacity drives outreach throttling in the acquisition module.
- **Platform core capabilities:**
  - authentication and invites
  - users and roles, with a permission map
  - the shared **companies and contacts directory**, used by all modules, never duplicated per module
  - app shell and navigation built from module manifests
  - command palette
  - in-app notifications
  - audit log
  - settings
  - encrypted integration credentials
  - the AI service with usage and cost logging
  - background jobs and schedules with a job-run log
  - file storage
- **The module system:** what a module manifest declares:
  - id, name, icon
  - navigation entries
  - route prefix
  - permissions it adds
  - jobs and cron schedules
  - settings panels
  - dashboard widgets for the platform home

  Also how a module is enabled or disabled, and how a new module is created from the `create-module` template.
- **Platform home:** a landing page after login that shows the user's own work across modules: their queue, their inbox count, their pipeline, and alerts.
- **Page and route map** for the core.
- **The loading, error and empty state of every core screen.**
- **Non-goals:**
  - no public signup
  - no client-facing pages
  - no billing
  - no multi-tenant or multi-company support (FUTUREUNI only)
- **Risks and open questions.**

### 3b. `docs/specs/module-acquisition.md`: Client Acquisition

This is the largest document. It must cover:

**Purpose and the end-to-end flow:**

> signal found → company created or matched in the shared directory → lead created (company × service line × market) → enriched → audited → scored → brief written → message drafted → review queue → approved → sent (email) or prepared (assisted channel) → reply received → classified → action (meeting / follow-up / referral / stop) → meeting → proposal → won or lost → handoff record

**Service-line tabs.** The module has five top-level views:

- one tab per service line: Web Development, UI/UX Design, Graphic Design, Video Editing
- an **Overview** tab that compares all lines

Every service-line tab has the same six sections:

1. **Search:**
   - market toggle: Nigeria / International / Both
   - location, keywords, sources to use, result limit
   - "Run now" or "Save as scheduled search"
2. **Review queue:** leads waiting for a human decision, showing audit findings and the drafted message. The actions are approve, edit, reject, reassign, and snooze.
3. **Pipeline:** a board by stage.
4. **Inbox:** replies for that line, classified.
5. **Analytics:** the metrics below.
6. **Settings (line-level):** profile, portfolio, pitch angles, pricing ranges, owner(s), capacity view.

Clicking a tab searches **only** that service line. There's no global "search everything" button. The Overview tab is read-only analytics plus cross-sell opportunities.

**Service-line profiles.** Describe what each profile contains (see the contract in Step 6). Give an initial, concrete version for each of the four lines. Include signals, suggested sources per market, the audit checks, pitch angles per market, and example disqualifiers:

- **Web Development:**
  - signals:
    - the business has no website (only a Google Maps, Instagram or Jiji presence)
    - slow site
    - not mobile-friendly
    - no SSL
    - outdated template
    - broken pages
    - a job post for a web developer
  - audits:
    - PageSpeed / Core Web Vitals
    - SSL
    - mobile viewport
    - HTTP errors
    - basic SEO tags
- **UI/UX Design:**
  - signals:
    - app store reviews that complain about usability
    - a clunky signup or onboarding flow
    - a recently funded startup
    - a job post for a UI/UX or product designer
  - audits:
    - review-text analysis
    - an onboarding or landing-page heuristic review from screenshots
- **Graphic Design:**
  - signals:
    - inconsistent branding across website and social profiles
    - weak ad creatives
    - a newly registered business
    - a job post for a graphic designer
  - audits:
    - visual consistency across profile images, colours and typography, using Claude vision on captured images
- **Video Editing:**
  - signals:
    - creators, coaches and brands posting regularly with rough editing
    - no captions
    - weak thumbnails
    - a gone-quiet channel
    - a job post for a video editor
  - audits:
    - YouTube and Instagram cadence
    - caption presence
    - thumbnail consistency
    - average length

**Markets.** What changes per market:

- sources
- channel preference: Nigeria is assisted WhatsApp first, then email; International is email first
- tone and pitch angles, for example "Lagos shares working hours with the UK and Europe"
- pricing currency: NGN, or USD/GBP/EUR
- portfolio pieces shown
- compliance rules (Step 4)
- send windows, which follow the recipient's timezone

**Lead lifecycle.** Use exactly these statuses and allowed transitions (draw them as a table):

- `NEW`
- `ENRICHING`
- `ENRICHED`
- `AUDITING`
- `AUDITED`
- `SCORED`
- `IN_REVIEW`
- `APPROVED`
- `CONTACTED`
- `REPLIED`
- `MEETING_BOOKED`
- `PROPOSAL_SENT`
- `WON`
- `LOST`
- `NURTURE`
- `DISQUALIFIED`
- `SUPPRESSED`

Every status change writes a `LeadEvent` row in the same transaction.

**Scoring.**

- Rule-based points per profile, giving a 0–100 score with a human-readable reason list.
- Leads in the borderline band (default 40–60) get a Claude review: a qualify/disqualify recommendation plus a reason. It assists a human; it doesn't replace one.
- Thresholds are configurable per line.

**Cross-sell.** When one company qualifies for more than one line, it's flagged once. Only one outreach thread per company is active at a time. The owners of the lines agree which line leads, and the default is the higher score.

**Capacity throttling.** When the owners of a line are at capacity, that line's scheduled searches pause and new leads go to `NURTURE`. They are not contacted.

**Outreach.**

- Sequences are defined per line and per market: steps, delays, channel per step.
- Every AI-written message must cite the audit finding IDs it relies on. A message that makes a claim without a stored finding behind it is rejected.
- Approval mode per line: `ALWAYS_REVIEW` (the default) or `AUTO_SEND_ABOVE_SCORE` (a threshold is set by an admin).
- Sending uses dedicated outreach mailboxes on separate domains, with a daily cap per mailbox, warm-up ramps, and send windows in the recipient's timezone (weekdays 09:00–17:00 by default).
- A reply or an unsubscribe stops the sequence immediately.

**Reply inbox.**

- Classes:
  - `INTERESTED`
  - `NOT_NOW` (with a follow-up date extracted when the reply gives one)
  - `WRONG_PERSON` (with the referral captured)
  - `OBJECTION_PRICE`
  - `OBJECTION_OTHER`
  - `QUESTION`
  - `UNSUBSCRIBE`
  - `OUT_OF_OFFICE`
  - `BOUNCE`
  - `OTHER`
- Each class has a default action.
- Drafted responses always need a human to send them.

**Meetings and proposals.**

- Booking links.
- A pre-call brief is generated before each meeting.
- A proposal/quote draft is generated from the line's pricing rules and service catalogue.
- Won/lost with a reason. A won deal creates a handoff record.

**Analytics** (per line, and compared on Overview):

- leads found per source
- enrichment rate
- average score
- approval rate
- sent
- reply rate
- positive-reply rate
- meetings
- proposals
- won
- revenue (in minor units and currency)
- average deal size
- time to close
- conversion by market
- conversion by source
- conversion by signal
- AI cost per won deal

Every analytic has a date range and a market filter.

**The rest of the spec:**

- a page and route map (under `/acquisition/...`)
- the loading, error and empty state of every screen
- non-goals: no LinkedIn automation, no unsolicited WhatsApp API messaging, no buying contact lists
- risks, open questions, and milestones mapped to phases 7–19 (see Step 7)

---

## Step 4: Write `.claude/project-rules.md`

Use saas-setup's section template exactly:

1. Product
2. Stack and commands
3. Brand and UI
4. Roles and permissions
5. Domain invariants
6. Bans
7. Output/document rules
8. Integrations

Rules go here, and only here. Other documents reference this file.

### Brand and UI

- **Colours.** These are the brand palette. Map them to semantic tokens in a table covering light and dark values: background, surface, zone, elevated, foreground, muted, subtle, primary, primary-foreground, accent, border, input, focus ring, success, warning, danger, info, and chart series.

  | Name | Hex |
  |---|---|
  | Primary violet | `#5342CC` |
  | Soft violet | `#A89DF5` |
  | Deep navy | `#0C1148` |
  | Ink | `#232849` |
  | Muted | `#5D6486` |
  | Lavender tint | `#E3E4F5` |

  Derive the success, warning, danger and info hues so they're harmonious with the palette and pass WCAG AA against their backgrounds. Check every text/background pair you define for AA contrast and write the ratio next to it.
- **Light theme is the default.** Dark theme means layered navy depth, not simple inversion.
- **Typography.**
  - Choose a distinctive display face, a highly readable UI sans, and a monospace for data, all loadable with `next/font`.
  - Don't use Inter, Roboto, Arial or system-default stacks as the primary faces.
  - Give two candidate pairings with reasons, pick one, and record it as an ADR.
- **Design direction.**
  - It must not look like a generic AI SaaS: no purple-gradient heroes, no uniform grids of identical cards, no cards inside cards, no emoji.
  - Violet is an accent used with intent, over navy and lavender surfaces.
  - Editorial type scale, asymmetric layouts, generous space.
  - Motion with purpose.
  - Follow saas-ui's philosophy and reference it by name.
- **Logo:** record the files found in `docs/brand/` and which to use on light and on dark backgrounds.
- **Devices:** internal staff mostly use laptops, but every screen must work down to 375px.

### Roles and permissions

- Write the full permission matrix as a table: action × role, for both platform-core actions and acquisition actions.
- Name each action as `module.resource.verb`, for example `acquisition.lead.approve`.

### Domain invariants

Numbered, testable rules. At minimum:

1. Every lead status change writes a `LeadEvent` in the same transaction.
2. Before any send or assisted-send link is generated, the suppression list is checked for the email, the phone and the domain, in the same code path that sends. A suppressed contact can never be messaged.
3. A reply, a bounce or an unsubscribe stops every active sequence enrolment for that contact **and that company** immediately.
4. Every outbound email includes a working one-click unsubscribe and FUTUREUNI's postal address.
5. Every personalised claim in an outbound message references at least one stored `AuditFinding` or `Signal` with a source URL. Messages failing this check can't be approved.
6. **UK rule (PECR):** cold email to UK sole traders or partnerships is blocked unless consent is recorded. Only incorporated bodies (limited companies, LLPs, PLCs) may receive cold B2B email. Leads whose legal form is unknown are held for review.
7. Automatic sending is allowed only on email. WhatsApp and LinkedIn messages are only ever prepared for a human to send.
8. Sends happen only inside the recipient's local send window, within each mailbox's daily cap and warm-up ramp.
9. A company has at most one active outreach thread across all service lines.
10. Every contact stores its source, when it was collected, and its lawful basis (default: legitimate interest for B2B). Data-subject requests (export or delete a contact) must be possible from the admin UI. Personal data on `DISQUALIFIED` and `LOST` leads is purged after a configurable retention period (default 12 months). Record the retention period as an ADR.
11. Money is stored as integer minor units plus an ISO 4217 currency code.
12. All timestamps are stored in UTC. Display them in the viewer's timezone. Send windows use the recipient's timezone.
13. Every AI call is logged with: task, prompt version, model, tokens, cost, latency and outcome. No secrets or unnecessary PII go into prompts or logs.
14. Sources are used only in ways their terms allow. `robots.txt` is respected for crawling. Anything that requires login-walled scraping is banned.

### Bans

At minimum:

- `any`
- `@ts-ignore`
- hardcoded hex colours outside the token file
- emoji in the UI
- direct Anthropic SDK use outside `src/platform/ai`
- real network calls in tests
- committing secrets
- plain-text credentials in the database
- LinkedIn automation
- WhatsApp bulk sending
- buying or importing purchased contact lists
- a phase editing a folder it doesn't own (see `CLAUDE.md`)

### Stack and commands

List the package scripts that Phase 1 will create:

- `dev`, `build`, `start`
- `lint`, `typecheck`
- `test`, `test:e2e`
- `db:migrate`, `db:generate`, `db:seed`, `db:studio`, `db:reset`
- `mocks:on`

### Output/document rules

- The formats for generated proposals and briefs: how they're structured, headings, currency formatting (₦ and $/£/€), and date formats.

### Integrations

- A pointer to `docs/integrations.md`.

---

## Step 5: Write `CLAUDE.md` and the phase protocol

`CLAUDE.md` is the first file every future session reads. Keep it under about 200 lines. Push detail into linked documents. It must contain, in this order:

1. **What this repository is.** Two or three sentences.
2. **Read-first list:**
   - `.claude/project-rules.md`
   - `docs/specs/platform.md`
   - the spec of the module you're working on
   - `docs/contracts/`
   - `docs/decisions.md`
   - `phases/README.md`
   - the `SUMMARY.md` of every completed phase
3. **The phase protocol:**
   - Every phase runs in its own git worktree and branch, named `phase/<nn>-<slug>`.
   - Start in plan mode. Read the read-first list and the phase prompt. Produce a plan and wait for approval.
   - Touch only the folders your phase owns in the ownership map. If you need a change anywhere else (schema, contracts, another phase's folder, shared config), **don't make it**. Write it to `phases/<nn>/REQUESTS.md` with the exact change and the reason. Requests are applied at merge time.
   - You may add npm dependencies. List each one, with the reason, in your `SUMMARY.md`. Lockfile conflicts are resolved at merge by reinstalling.
   - When finished, write `phases/<nn>/SUMMARY.md` using `phases/SUMMARY_TEMPLATE.md`, run `saas-review` on your whole diff, and fix all Critical and Major findings. Make sure lint, typecheck, tests and build all pass.
   - Never commit or merge unless asked.
4. **The ownership map.** This is the most important table in the repository. Map every folder to the one phase that creates it and owns it. Use this layout; you may refine names but must keep one owner per path.

   | Path | Owner phase |
   |---|---|
   | `CLAUDE.md`, `.claude/`, `docs/specs/`, `docs/contracts/`, `docs/decisions.md`, `docs/integrations.md`, `phases/README.md`, `.mcp.json` | 0 (changed later only when a wave is merged) |
   | Root config: `package.json` scripts, `tsconfig`, `next.config`, `vercel.json`, `tailwind` config, `eslint`/`prettier`, `docker-compose.yml`, `.github/`, `src/env.ts` | 1 |
   | `prisma/` (schema, migrations, seed), `src/contracts/`, `src/platform/registry/`, `src/platform/db/`, `templates/create-module/` | 2 |
   | `src/platform/auth/`, `src/app/(auth)/`, `src/platform/team/` | 3 |
   | `src/styles/`, `src/components/ui/`, `src/components/shell/`, `src/lib/motion.ts`, `src/app/(platform)/layout.tsx`, `src/app/(platform)/page.tsx` (platform home) | 4 |
   | `src/platform/ai/`, `runtime-skills/_shared/` | 5 |
   | `src/platform/jobs/`, `src/platform/notifications/`, `src/platform/audit-log/`, `src/platform/settings/`, `src/platform/credentials/`, `src/platform/storage/`, `src/app/api/cron/`, `src/app/api/workflows/` (framework only) | 6 |
   | `src/modules/acquisition/profiles/`, `runtime-skills/acquisition/` | 7 |
   | `src/modules/acquisition/sourcing/` | 8 |
   | `src/modules/acquisition/enrichment/`, `src/modules/acquisition/compliance/` | 9 |
   | `src/modules/acquisition/audits/` | 10 |
   | `src/modules/acquisition/scoring/`, `src/modules/acquisition/crosssell/` | 11 |
   | `src/modules/acquisition/outreach/` | 12 |
   | `src/modules/acquisition/inbox/` | 13 |
   | `src/modules/acquisition/pipeline/` (meetings, proposals, deals, handoff) | 14 |
   | `src/app/(platform)/acquisition/layout.tsx`, `.../[line]/search/`, `.../[line]/review/`, `src/modules/acquisition/ui/shell/` | 15 |
   | `.../[line]/leads/`, `.../[line]/pipeline/`, `.../[line]/inbox/`, `src/modules/acquisition/ui/leads/`, `src/modules/acquisition/ui/inbox/` | 16 |
   | `.../[line]/analytics/`, `src/app/(platform)/acquisition/overview/`, `src/modules/acquisition/analytics/`, `src/modules/acquisition/ui/analytics/` | 17 |
   | `.../[line]/settings/`, `src/app/(platform)/settings/`, `src/app/(platform)/admin/`, `src/modules/acquisition/ui/settings/` | 18 |
   | `src/modules/acquisition/manifest.ts`, `src/modules/acquisition/workflows/` (pipeline orchestration), `tests/e2e/` | 19 |
   | Hardening fixes anywhere, as review findings | 20 |
   | Deploy config, `docs/runbook.md`, `docs/onboarding.md` | 21 |

5. **Conventions:**
   - naming
   - import aliases (`@/platform/*`, `@/modules/*`, `@/contracts/*`, `@/components/*`)
   - server-only code rules
   - where tests live (next to the code, as `*.test.ts`)
   - mocks (`<adapter>/mock.ts`, selected through settings)
   - errors (one `AppError` shape)
6. **Where the saas-* skills apply,** with a one-line pointer per skill.
7. **A placeholder for saas-setup's marker block.** Put an empty `<!-- saas-skills:start -->` / `<!-- saas-skills:end -->` pair at the end. Phase 1 fills it.

Also create:

- **`phases/README.md`** containing:
  - the full list of 22 phases grouped into 6 waves (table below)
  - which phases run in parallel
  - dependencies
  - the merge procedure for a wave:
    1. merge each branch
    2. apply every `REQUESTS.md`
    3. reinstall
    4. run migrations
    5. run lint, typecheck, test and build
    6. update the "Completed phases" list

  | Wave | Phases | Mode |
  |---|---|---|
  | 0 | 0 Requirements · 1 Scaffold · 2 Core schema and registry | Sequential |
  | 1 | 3 Auth and team · 4 Design system and shell · 5 AI service · 6 Jobs, notifications, audit log, settings, credentials | Parallel |
  | 2 | 7 Profiles and runtime skills · 8 Sourcing · 9 Enrichment and compliance · 10 Audits | Parallel |
  | 3 | 11 Scoring and cross-sell · 12 Outreach · 13 Inbox · 14 Pipeline, meetings, proposals | Parallel |
  | 4 | 15 Module shell, search, review · 16 Leads, pipeline, inbox screens · 17 Analytics · 18 Admin and settings screens | Parallel |
  | 5 | 19 Integration and orchestration · 20 Hardening · 21 Deploy and go-live | Sequential |

- **`phases/SUMMARY_TEMPLATE.md`** with these sections:
  - What was built
  - Files and folders created
  - Public interfaces other phases can use
  - Decisions made (and any new ADRs proposed)
  - Dependencies added
  - Change requests raised
  - Known limitations
  - How to test it
- **`phases/00/SUMMARY.md`**, written at the end of this phase.

---

## Step 6: Write the contracts (`docs/contracts/`)

These are the interfaces that let parallel phases work without talking to each other. Write each one as a Markdown file containing:

- the exact TypeScript types and Zod schemas in code blocks
- the rules around the interface
- one worked example

Phase 2 turns these into real files in `src/contracts/` without changing them.

1. **`module-manifest.md`:**
   - `ModuleManifest`: id, name, icon, route prefix, navigation tree, permissions, jobs, cron schedules, settings panels, home widgets, `enabled` flag
   - how the registry discovers manifests
   - how the shell renders the manifest's navigation
2. **`service-line-profile.md`:**
   - `ServiceLineProfile` (Zod) with:
     - `id` (the enum)
     - label, description
     - `ownerRoles` / owner user IDs
     - `signals[]` (id, label, description, weight, markets)
     - `sources[]` (adapter id, markets, default params)
     - `audits[]` (audit agent id, required or optional)
     - `scoring` (rules: condition → points, thresholds, borderline band)
     - `pitchAngles` per market
     - `portfolio[]` (title, URL, media, tags, markets)
     - `pricing` (ranges per market in minor units and currency)
     - `sequences` per market
     - `disqualifiers[]`
     - `approvalMode`
     - `capacityPolicy`
   - how profiles are versioned and how the settings UI edits them. Profiles are seeded from code and then edited in the database, and every edit creates a new version.
3. **`source-adapter.md`:**
   - `SourceAdapter`: id, label, markets, `supportedServiceLines`, `paramsSchema` (Zod), `search(params, ctx): AsyncIterable<RawSignal>`, `rateLimit`, `termsNotes`
   - `RawSignal`:
     - company name, website, phone, address, country
     - social URLs
     - the signal type
     - the evidence text
     - the source URL
     - when it was observed
     - raw payload
   - dedupe rules: normalised domain first, then normalised phone, then name plus city
   - the list of the first adapters and their market:
     - `google-places` (both)
     - `jobs-serpapi` (both)
     - `jobs-adzuna` (international)
     - `jobberman` and `myjobmag` (Nigeria, only if their terms allow; otherwise marked disabled with a reason)
     - `csv-import` (both)
     - `manual` (both)
4. **`enrichment.md`:**
   - the `Enricher` interface
   - the email finder adapter (Hunter/Apollo plus mock)
   - the email verifier
   - the website crawler rules (same-domain only, respect `robots.txt`, page limit, timeout)
   - the output fields
   - the legal-form detection used for the UK rule, for example Companies House lookup for UK companies
5. **`audit-agent.md`:**
   - `AuditAgent`: id, service line, `run(company, ctx): Promise<AuditResult>`
   - `AuditFinding`: id, check, severity, claim, evidence, `sourceUrl`, `capturedAt`, `artifactUrl?`
   - the rule that the claim must be supported by the evidence
   - the four initial agents and their checks
6. **`ai-service.md`:**
   - `ai.run({ task, promptVersion?, input, outputSchema, context })`, returning validated output plus usage
   - the task registry
   - how runtime skill files are laid out and loaded (`runtime-skills/<module>/<task>/SKILL.md` plus references)
   - prompt versioning
   - one repair retry on schema failure
   - cost logging, quotas, timeouts
   - the mock mode, which returns deterministic fixtures
7. **`jobs.md`:**
   - how a module defines a job and a Workflow (Vercel Workflow)
   - how cron schedules are declared in the manifest and wired to `src/app/api/cron/`
   - idempotency keys
   - the job-run log
   - the local development runner
8. **`outreach-channel.md`:**
   - `EmailSender` adapter (mock plus real), the `Mailbox` model, send-window and cap enforcement, unsubscribe tokens, tracking events
   - `AssistedChannel`: WhatsApp link builder, LinkedIn "copy and open profile"
   - the `InboundReplySource` adapter
9. **`permissions.md`:**
   - `can(user, action, resource?)`, the action naming scheme, and how modules register actions through the manifest
10. **`events.md`:**
    - the domain events modules emit, for example `lead.statusChanged`, `reply.received`, `deal.won`
    - their payloads
    - how notifications and analytics subscribe to them

---

## Step 7: Write the data model (`docs/specs/data-model.md`)

Write the complete data model that Phase 2 will turn into the Prisma schema. It needs:

- a Mermaid ER diagram
- then one table per entity: every field with its type, whether it's nullable, its default, indexes, unique constraints, relations and `onDelete` behaviour

**Rules:**

- IDs are cuid.
- Every entity has `createdAt` and `updatedAt`.
- Soft delete (`deletedAt`) only where stated.
- Money is minor units plus currency.
- Enums are used for finite states.
- There's an index for every foreign key and every filtered or sorted column.
- Acquisition tables are prefixed or mapped under an `acq_` namespace using Prisma's multi-file schema, so future modules have clean separation.

**Platform core entities** (at minimum):

- `User`, plus the auth library's `Session`, `Account` and `Verification` tables (Phase 0 picks the auth library, see the ADRs)
- `Invite`
- `TeamProfile` (service lines, weekly capacity, current load, timezone)
- `Company` (shared directory: name, normalised domain, website, phones, country, city, market, legal form, industry, size range, socials, first source, lawful basis)
- `Contact` (company, name, role, email, email status, phone, WhatsApp-capable flag, LinkedIn URL, source, collected at, lawful basis)
- `Note`
- `AuditLog`
- `Notification`
- `Setting`
- `IntegrationCredential` (encrypted payload, provider, status)
- `AiCall` (usage log)
- `PromptVersion`
- `JobRun`
- `FileObject`

**Acquisition entities** (at minimum):

- `ServiceLineProfileVersion`
- `SavedSearch`
- `SearchRun`
- `Signal`
- `Lead` (company × service line × market, status, score, score reasons, owner, brief, cross-sell group)
- `LeadEvent`
- `Audit`
- `AuditFinding`
- `ScoreReview` (the Claude borderline review)
- `Sequence`
- `SequenceStep`
- `Enrollment`
- `Message` (draft/approved/sent, channel, mailbox, cited finding IDs, approval by and at)
- `Mailbox`
- `SendingDomain`
- `TrackingEvent`
- `Reply` (classification, extracted follow-up date, referral)
- `Suppression` (email, phone or domain, reason, source)
- `ConsentRecord`
- `Meeting`
- `Proposal`
- `Deal` (value, currency, won/lost reason)
- `Handoff`
- `CrossSellGroup`
- `DataSubjectRequest`

Finish with the **seed plan**: realistic development data for all four lines in both markets. That means a few dozen companies, leads spread across statuses, audits with findings, messages, replies of every class, meetings, proposals and won/lost deals, so every screen has data from day one.

---

## Step 8: Write the integrations register and environment template

**`docs/integrations.md`** is one table with these columns:

| Service | Purpose | Used by phase | Adapter id | Mock available | Free tier or trial | Pricing notes | Signup link | Needed before go-live? |
|---|---|---|---|---|---|---|---|---|

Include at least:

- Anthropic API
- Neon (Vercel Marketplace)
- Vercel Blob
- Vercel Workflow and Cron
- Google Places API
- Google PageSpeed Insights API
- YouTube Data API
- SerpAPI (Google Jobs)
- Adzuna API
- Hunter or Apollo (email finding and verification)
- Companies House API (UK legal form)
- a transactional email provider for platform emails (Resend)
- the cold-outreach sending approach (see below)
- inbound reply ingestion
- Cal.com or Google Calendar
- a screenshot/browser runtime for UI/UX audits (Vercel Sandbox or a serverless Chromium, see below)
- Sentry (monitoring)

Verify current names, free tiers and pricing on the web before writing. Mark anything you couldn't verify with "verify".

**Two decisions to research and record as ADRs,** each with options, a recommendation and a reason:

1. **Cold-outreach sending.** The options are:
   - Google Workspace mailboxes on dedicated outreach domains, sent through the Gmail API or SMTP
   - Microsoft 365 mailboxes
   - a sending platform such as Instantly or Smartlead through its API

   Consider deliverability, cost for about 3–6 mailboxes, reply ingestion, and the domain warm-up needs.
2. **Headless browser on Vercel.** Screenshots of landing and onboarding pages for UI/UX and graphic design audits. The options are Vercel Sandbox, `@sparticuz/chromium` in a function, or a hosted screenshot API. Consider duration limits, cost and reliability.

**Other ADRs to decide:**

- **Auth library:** recommend Better Auth or Auth.js, following saas-auth, with a reason.
- **Data retention period.**
- **Font pairing** (from Step 4).

**`.env.example`:** every variable the platform will need, grouped by service, each with a comment. It includes `MOCKS=true` (the default for local), the AI model names and the encryption key for credentials. Values are placeholders only.

---

## Step 9: Configure MCP servers (`.mcp.json`)

Create a project `.mcp.json` for the MCP servers Claude Code will use **while building** (not at runtime). Check each server's current, official installation method in its documentation before writing the config. Use environment variable references, never secrets.

| MCP server | Purpose |
|---|---|
| Prisma (the Prisma CLI's built-in MCP server) | Schema and migration help against the local database |
| Playwright (`@playwright/mcp`) | Lets Claude Code open the running app and verify UI visually in every UI phase |
| Context7 | Up-to-date docs for Next.js, Prisma, Vercel Workflow, Better Auth/Auth.js, Tailwind and Motion |
| GitHub (official) | Issues, pull requests and branches, if the repo is on GitHub |
| Vercel (official remote MCP) | Deployments, logs and env, used from Phase 21 |
| Neon (official) | Database branches, optional |

In `docs/integrations.md`, add a short "MCP servers" section: what each one is for, which phases use it, and anything I must do by hand (log in, create a token).

---

## Step 10: Write the phase-to-milestone map

At the end of `docs/specs/module-acquisition.md`, map each of phases 7 to 19 to the part of the module spec it delivers and the acceptance criteria that prove it's done. Future phase prompts will quote these criteria.

---

## Constraints for this phase

- **No application code:** no Next.js app, no Prisma schema file, no `package.json`. Those belong to Phases 1 and 2. TypeScript and Zod appear only inside Markdown code blocks in `docs/contracts/`.
- **Every document is self-contained enough** that a fresh Claude Code session can act on it without this prompt.
- **One rule, one place.** Rules live in `project-rules.md`, interfaces in `docs/contracts/`, decisions in `docs/decisions.md`. Other files link to them.
- **Be concrete.** Use real field names, real enum values and real route paths. No "TBD" unless it's in "Open questions" with an owner and a suggested default.
- **Where you researched something on the web** (pricing, API limits, MCP install commands), cite the source URL in the document.

---

## Done when

- [ ] `docs/specs/platform.md`, `docs/specs/module-acquisition.md` and `docs/specs/data-model.md` exist and meet Steps 3 and 7.
- [ ] `.claude/project-rules.md` exists with all eight sections, the token table with contrast ratios, the full permission matrix, the numbered domain invariants and the bans.
- [ ] `CLAUDE.md` exists with the read-first list, the phase protocol, the complete ownership map (one owner per path), conventions, and the empty saas-skills marker block.
- [ ] `docs/contracts/` holds all ten contracts, each with types, rules and an example.
- [ ] `docs/decisions.md` holds ADR-001 to ADR-012 plus the researched ADRs: cold-outreach sending, headless browser, auth library, retention, font pairing.
- [ ] `docs/integrations.md` and `.env.example` exist, and `.mcp.json` is valid JSON with no secrets.
- [ ] `phases/README.md`, `phases/SUMMARY_TEMPLATE.md` and `phases/00/SUMMARY.md` exist.
- [ ] Final self-check. Report the result of each:
  - every entity in the data model is used by at least one spec section
  - every contract type is referenced by the data model or a spec
  - every path in the ownership map has exactly one owner
  - every domain invariant is testable
- [ ] End with a short report:
  - what was created
  - the decisions you made
  - anything I must do by hand (accounts, tokens, logo files)
  - the open questions, each with your suggested default
