# FUTUREUNI Internal Platform: Build Roadmap

**First module:** Client Acquisition (all four service lines, Nigeria and international markets)
**Total:** 22 phases (0 to 21) in 6 waves. When Phase 21 is done, the platform is live in production.

---

## How to use this roadmap

> **To run the build, follow `RUN-GUIDE.md`.** It regroups these phases into batches of at most 3 terminals and gives the exact command for each phase. The waves below describe *what* gets built; the run guide describes *how to run it*.

- **Waves run in order.** All phases inside one wave can run at the same time, each in its own terminal and its own git worktree.
- **Merge the whole wave before starting the next one.**
- **Plan before building.** Start every phase in Claude Code plan mode, approve the plan, then build.
- **Every phase starts by reading** `CLAUDE.md`, `.claude/project-rules.md` and the `phases/` folder.
- **Every phase ends by writing** `phases/<number>/SUMMARY.md`: what was built, the decisions made, and what other phases can rely on.
- **Only Phase 2 edits the database schema and the shared contracts.** If a later phase needs a change to either, it writes the change into `phases/<number>/REQUESTS.md`. You apply it when you merge the wave.
- **Each phase owns its folders.** It never edits a folder owned by another phase. The ownership map lives in `CLAUDE.md`.
- **The skill in brackets** after each phase name is the saas-* skill that leads that phase. `saas-review` runs at the end of every phase.

### Progress markers

| Where you are | What it means |
|---|---|
| End of Wave 1 (Phase 6) | Platform core done: login, shell, AI layer, jobs |
| End of Wave 3 (Phase 14) | The acquisition engine works end to end, without screens |
| End of Wave 4 (Phase 18) | Every screen is built |
| Phase 19 | Almost there: everything is wired together and tested |
| Phase 21 | Done: live in production |

---

## Fixed decisions

- **Stack:** Next.js App Router, TypeScript (strict), Tailwind, Prisma, PostgreSQL, Zod.
- **Hosting:** Vercel (Pro plan), with Neon Postgres added through the Vercel Marketplace and Vercel Blob for files. It's all one Vercel project, one dashboard and one bill.
- **Background jobs:** Vercel Workflow runs multi-step jobs and resumes from the last completed step. Vercel Cron handles schedules.
- **Architecture:** a modular monolith. That means one app, one database, one login and one host. Each tool is a self-contained module, and Client Acquisition is the first one.
- **Theme:** light theme is the default. Dark mode is also built and is fully supported.
- **Service lines:** Web Development, UI/UX Design, Graphic Design, Video Editing.
- **Markets:** Nigeria, International, or Both. The user picks one in the search panel.

### Brand colours (from the FUTUREUNI Growth Engine document)

| Token role | Hex |
|---|---|
| Primary violet | `#5342CC` |
| Soft violet | `#A89DF5` |
| Deep navy | `#0C1148` |
| Ink (body text) | `#232849` |
| Muted text | `#5D6486` |
| Lavender tint (surfaces) | `#E3E4F5` |

Violet is used as an accent over navy and lavender surfaces, with editorial layouts. No generic purple-gradient look (per saas-ui).

---

## Wave 0: Requirements and foundation (one phase at a time)

### Phase 0: Requirements pack (saas-plan)
No application code in this phase. It creates:
- The platform spec and the Client Acquisition module spec in `docs/specs/`
- `CLAUDE.md`, containing:
  - the phase protocol
  - the folder ownership map
  - the rules for summaries and change requests
  - "read project-rules first"
- `.claude/project-rules.md`, containing:
  - brand tokens
  - roles and permissions
  - bans
  - market compliance rules (see below)
- The data model and ERD
- The contracts:
  - module contract
  - service-line profile schema
  - source adapter interface
  - audit interface
  - Claude service interface
- `.mcp.json`, the MCP servers used while building:
  - **Postgres:** read access to the development database
  - **Playwright:** lets Claude Code check the UI visually
  - **GitHub:** repository access
  - **Context7:** up-to-date library documentation
- A register of external services and `.env.example`
- The hosting decision and a decisions log in `docs/decisions.md`

Market compliance rules to capture:
- **Nigeria:** Nigeria Data Protection Act (NDPA)
- **UK:** UK GDPR and PECR, including the rule that sole traders and partnerships can't be cold-emailed without prior consent
- **US:** CAN-SPAM

Candidate external services:
- Anthropic
- Google Places
- PageSpeed Insights
- YouTube Data
- a jobs API (SerpAPI or Adzuna)
- an email finder (Hunter or Apollo)
- an email sender
- a calendar (Cal.com or Google Calendar)

### Phase 1: Scaffold (saas-setup)
- Next.js project (`src/` layout) with the folder structure from the Phase 0 ownership map
- Tailwind tokens with the FUTUREUNI colours
- Docker Compose for local Postgres
- Vercel project config (`vercel.json`) and the Workflow setup
- Validated environment variables
- CI stub and Claude Code hooks

### Phase 2: Core schema and module registry (saas-data)
- The complete Prisma schema for the platform core and Client Acquisition. Service line and market fields are included from day one.
- Migrations and realistic seed data
- Typed contract stubs for every interface from Phase 0
- The module registry. Each tool declares its menu, routes, permissions and jobs there.
- A `create-module` template, so future tools such as Marketing start fast

---

## Wave 1: Platform core (4 in parallel, starts after Wave 0)

### Phase 3: Auth, users, roles, team (saas-auth)
- Login and invites
- Roles: Admin, Manager, and a lead for each service line
- The permission map
- Team profiles with service line and capacity

### Phase 4: Design system and app shell (saas-ui)
- The token system in light and dark
- The component library
- The platform shell: a module switcher, and navigation driven by the module registry
- Command palette
- Loading, empty and error patterns
- Chart theme and logo usage
- Runs on a mock session until Phase 3 is merged

### Phase 5: Claude service layer (saas-ai)
- Provider adapter
- Loads skill and prompt files, with versions
- Structured output validated with Zod
- Logs cost and usage, and enforces quotas
- Eval harness

### Phase 6: Jobs, scheduler, notifications, audit log, settings (saas-api + saas-notify)
- Job framework on Vercel Workflow, with Vercel Cron schedules registered from module manifests
- A job-run log
- In-app notifications
- Audit log helper
- Settings store
- Encrypted storage for integration API keys

---

## Wave 2: Acquisition engine (4 in parallel, starts after Wave 1)

### Phase 7: Service-line profiles and the runtime FUTUREUNI skill
There are four profiles: Web Development, UI/UX, Graphic Design and Video Editing. Each one defines:
- signals
- sources
- audit
- pitch angles
- portfolio
- pricing ranges
- owner

Each profile has reference files for Nigeria and for international. The running app loads these; they aren't `CLAUDE.md` instructions for building.

### Phase 8: Sourcing framework and adapters
- The adapter runner
- Dedupes results into the shared companies directory
- Market tagging, rate limits and retries
- Adapters:
  - Google Places
  - job boards (only where their terms allow it)
  - CSV import
  - manual add

### Phase 9: Enrichment and contact discovery
- Website crawler
- Email finder adapter and email verification
- Social handles
- Compliance flags: UK sole traders, the suppression list

### Phase 10: Audit agents for each service line
Every finding is stored with its evidence and source.

| Service line | What the audit checks |
|---|---|
| Web Development | Speed, SSL, mobile, whether a website exists at all |
| UI/UX | App store reviews; onboarding captured with Playwright |
| Graphic Design | Brand consistency, checked with Claude vision |
| Video Editing | Posting cadence, captions, thumbnails |

---

## Wave 3: Intelligence and outreach (4 in parallel, starts after Wave 2)

### Phase 11: Scoring and qualification
- Scoring rules for each profile
- Claude reviews borderline leads
- Lead briefs
- Cross-sell detection
- Outreach slows down automatically when a team member is at capacity

### Phase 12: Outreach engine
- Sequences
- Approval queue
- Messages that cite their evidence
- Sending setup:
  - separate outreach domains
  - warm-up caps
  - send times based on the recipient's timezone
- A pre-filled "Send on WhatsApp" button
- Unsubscribe and suppression

### Phase 13: Reply inbox
- Receives incoming replies
- Classifies each reply
- Actions: follow up later, contact the referred person, stop the sequence
- Routes the reply to the service owner
- Drafts a response

### Phase 14: Pipeline, meetings, proposals
- Pipeline stages
- Calendar booking
- Pre-call brief
- Proposal and quote generator built from the pricing rules
- Won/lost tracking and the handoff record

---

## Wave 4: Client Acquisition interface (4 in parallel, starts after Wave 3)

### Phase 15: Module shell and search
- Service-line tabs
- Search panel with the Nigeria / International / Both toggle
- Saved searches
- Review queue

### Phase 16: Leads, pipeline and inbox screens
- Lead detail with audit evidence
- Pipeline board
- Inbox and conversation view

### Phase 17: Analytics (dataviz)
- Analytics for each service line
- An Overview tab comparing all service lines
- Splits by market and by source

### Phase 18: Admin and settings screens
- Profile editor
- Sources and credentials
- Team capacity
- Sending domains
- Suppression list
- Prompt versions
- AI usage and cost

---

## Wave 5: Integration and launch (one phase at a time)

### Phase 19: End-to-end integration (the "almost there" point)
- Wires the whole pipeline together on schedules
- Applies every change request left in any `REQUESTS.md`
- Playwright end-to-end tests for every service line in every market

### Phase 20: Hardening (saas-review + saas-testing)
- Full security audit
- Compliance check
- Performance and accessibility
- Dark mode polish
- AI cost caps
- Failure and retry behaviour

### Phase 21: Deploy and go-live (saas-ship)
- Host setup and domains
- SPF, DKIM and DMARC on the outreach domains, plus warm-up
- Switch from mock providers to real ones
- Backups and monitoring
- Runbook and team onboarding guide

**Done.**

---

## After Phase 21: adding the next tool

A new tool (for example Marketing) starts from the `create-module` template. It gets its own Wave 0 to Wave 4 and never touches the platform core.

---

## Hosting: Vercel

- **Plan:** Vercel **Pro**. The free Hobby plan is for personal, non-commercial use, and it can't connect to repositories owned by a GitHub organisation.
- **Database:** Neon Postgres, added through the Vercel Marketplace. It's billed on the same Vercel account.
- **Files:** Vercel Blob, for screenshots, proposal PDFs and CSV uploads.
- **Background work:**
  - Vercel Workflow for multi-step pipelines (source → enrich → audit → score). Each step is saved, so a failure resumes from the last completed step.
  - Vercel Cron for schedules such as saved searches and sequence ticks.
- **Headless browser work** (UI/UX audit screenshots): Vercel Sandbox or a serverless Chromium build. The exact choice is made in Phase 0 and proven in Phase 10.
- **Local development:** Docker Compose Postgres, or a Neon development branch.
