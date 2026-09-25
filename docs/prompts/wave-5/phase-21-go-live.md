# Phase 21: Deploy and Go-Live

> **How to run this phase**
> 1. Phase 20 must be merged, and its "Needs a human decision before launch" list reviewed by you.
> 2. Put this file in `docs/prompts/`. Run `git checkout -b phase/21-go-live`.
> 3. Open Claude Code. Use Opus at maximum effort and switch to plan mode.
> 4. Say: **"Read docs/prompts/phase-21-go-live.md and execute it. Plan first."**
>
> Wave 5, the final phase. **Several steps need you (Prince) to create accounts, buy domains or approve spending.** Claude will stop and ask at each of those points, with exact instructions.
> When this phase is done, the platform is live and the build is complete.

---

## Your role and the goal of this phase

You're the release engineer, following the **`saas-ship`** skill. You take the hardened platform to production on Vercel, **safely and in stages**:

1. **The platform goes live first,** with mock providers off and real providers switched on one at a time.
2. **Outreach mailboxes are set up and warm up** while the team uses search, enrichment, audits and review with real data.
3. **Real sending starts** only when every gate is green.

You also deliver monitoring, backups, a tested restore, a runbook, a team onboarding guide and the handover pack.

**Rules for human steps:**

- Whenever something needs an account, a purchase, a DNS change at the registrar, a payment, or a decision only I can make, **stop and ask me.**
- Give numbered click-by-click instructions and say exactly what to send back to you, such as a token name or a confirmation. **Don't ask me to paste secret values into the chat.** Secrets go directly into Vercel's environment settings or the platform's credentials screen.
- Use the **Vercel MCP** and the **Neon MCP** (configured in Phase 0) for anything they can do, once I've authorised them.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md`, `docs/decisions.md`, `docs/architecture.md`, `docs/schedules.md`, `docs/cost-model.md`, `docs/hardening-report.md` and `docs/integrations.md`
2. `phases/12/SUMMARY.md` (the "Before sending for real" checklist), `phases/06/SUMMARY.md` (platform email deliverability notes) and `phases/20/SUMMARY.md`
3. **The global skill `saas-ship` in full** (CI, monitoring, performance, release checklist, handover templates), plus `saas-review`

Use Context7 or the web to verify the **current** details of:

- the Vercel Pro plan, environments, environment variables, cron, Workflow, deployment protection, instant rollback, spend management and log drains
- Neon on the Vercel Marketplace: branching for previews, the point-in-time restore window on the chosen plan, and the pooled versus direct URLs
- Vercel Blob
- Sentry for Next.js
- Google Workspace (or the ADR's mail provider) SPF/DKIM/DMARC setup
- the Gmail and Yahoo bulk-sender requirements
- the NDPA 2023 breach-notification duty (**verify** the timeframe)

Cite the sources in the runbook.

---

## Step 1: Accounts and access checklist

Produce the full list of accounts needed, each with its purpose, the plan or tier, the expected monthly cost (from `docs/cost-model.md`) and who should own it. It's a FUTUREUNI company account, not a personal one. Then **stop and ask me** to confirm each one exists, or to create it following your steps:

- a GitHub organisation repository
- the Vercel Pro team
- Neon (through Vercel)
- Vercel Blob
- the domain registrar
- the ADR's outreach mail provider (for example Google Workspace)
- Resend (platform email)
- Anthropic (API key, spend limit)
- Google Cloud project (Places, PageSpeed, YouTube Data), **with API key restrictions and a billing budget alert**
- SerpAPI
- Adzuna
- Hunter (or Apollo)
- Companies House
- Cal.com (or Google Calendar)
- Sentry
- an uptime monitor (or Vercel's own, if sufficient)
- a team password manager, for the encryption key and recovery codes

---

## Step 2: Environments and configuration

1. **Environments:**
   - **Development:** local.
   - **Preview:** every branch, with a **Neon branch per preview**, `MOCKS=true`, and `seed:staging` data. Protected with Vercel deployment protection.
   - **Production:** `main` only, with `MOCKS=false`.
2. **Environment variables:**
   - Every variable in `src/env.ts`, set per environment in Vercel, through the Vercel MCP or CLI for names and non-secret values.
   - For secrets, instruct me to paste them directly into the Vercel dashboard.
   - Generate and set:
     - `CREDENTIALS_ENCRYPTION_KEY`: **tell me to store a copy in the password manager.** If it's lost, every stored credential is unrecoverable.
     - `CRON_SECRET`
     - the unsubscribe token secret
3. **Build and deploy config:**
   - connect the repository
   - Node version and pnpm
   - `vercel.json` with the single cron tick entry
   - Workflow enabled
   - function regions: choose the region closest to the Neon database, and record the choice
4. **Migrations:**
   - Add a CI deploy step that runs `prisma migrate deploy` against `DIRECT_URL` **before** promoting a production deployment.
   - Migrations never run from a laptop against production.
   - Document how preview branches get their migrations.
5. **Bootstrap production:**
   - `pnpm bootstrap:admin` creates the first admin (you) with an invite link; 2FA is set up on first sign-in
   - it sets the production defaults from Phase 20 (budgets, caps, kill switch **on** until launch)
   - **it never runs the development seed in production**
6. **Security:** confirm the Phase 20 headers and CSP on the production domain, `noindex`, and deployment protection on previews.

---

## Step 3: Domains and DNS

**Stop and ask me** for the domain decisions. Then give exact records for each.

1. **Platform domain:** for example `app.<futureuni-domain>`, pointing at Vercel, with HTTPS.
2. **Platform email** (Resend): a sending subdomain with SPF, DKIM and DMARC. Verify it in Resend.
3. **Outreach domains:**
   - Recommend **2–3 separate domains**, close variants of the brand (I'll choose the names), never the main company domain.
   - Each gets:
     - the mail provider's MX records
     - SPF (only the provider)
     - DKIM (the provider's key)
     - DMARC, starting at `p=none` with reporting and moving to `quarantine` after warm-up (put this in the runbook with dates)
   - Each domain's website redirects to the main FUTUREUNI site.
   - 1–2 mailboxes per domain, with real-looking sender names of actual FUTUREUNI staff who agree to it.
4. **Verify** with the platform's **DNS check** in `/admin/mailboxes`. Everything must be green.
5. **Warm-up plan:**
   - Mailboxes start at the Phase 12 warm-up ramp.
   - Recommend a reputable warm-up approach if the ADR includes one; otherwise, gradual genuine sending.
   - Write a **dated warm-up calendar** (about 3–4 weeks) into the runbook.
   - Test inbox placement with a seed test before launch (for example mail-tester-style checks) and record the scores.

---

## Step 4: Switch from mock to real providers, one at a time

In production, in this order, and for each provider:

1. I add the credential in `/admin/integrations`.
2. Run **Test connection**.
3. Run the smallest real operation.
4. Check the result and the cost.
5. Record it in the go-live log (`docs/go-live-log.md`).

The order:

1. **Anthropic.** Run one `platform.summarize-company` call.
2. **Google Places, SerpAPI, Adzuna, YouTube and the App Store.** Run one search per line with `limit: 3`, per market.
3. **Hunter and Companies House.** Enrich those leads.
4. **PageSpeed and the browser runtime.** Audit those leads, and look at the screenshots.
5. **Resend.** Send an invite to a teammate.
6. **Calendar.** Book a test meeting against a test lead, and watch the webhook land.
7. **Outreach mailboxes and inbound.** Send **only to internal test addresses** (a suppression-safe test list): check the threading, the footer and one-click unsubscribe (from a real Gmail and a real Outlook inbox), and that a reply is ingested and classified.

After this step, compare the real per-lead cost with `docs/cost-model.md` and update the model.

---

## Step 5: Monitoring, alerts and spend protection

- **Sentry** on server and client:
  - source maps
  - **PII scrubbing configured** (emails, phones, message bodies)
  - releases tied to deployments
  - environment tags
- **Logs:** Vercel runtime logs, plus a log drain if the plan and need justify one. Structured logs with no PII (Phase 20).
- **An uptime check** on `/api/health` and the sign-in page.
- **Alerts,** routed to admins through platform notifications and email:
  - an error-rate spike
  - a job failure rate or dead letters
  - an AI budget at 80% and 100%
  - a mailbox auto-paused
  - a bounce-rate spike
  - an integration failing its health check
  - a cron tick missing for over 15 minutes
- **Spend protection:**
  - Vercel spend management limits
  - Anthropic monthly limit
  - Google Cloud budget alerts
  - provider caps
  - all recorded in the runbook

---

## Step 6: Backups and a tested restore

- **Neon point-in-time restore:** confirm the retention window on the chosen plan, and record it.
- **A nightly logical backup:** a GitHub Action or scheduled job runs `pg_dump` against the direct URL and stores an encrypted file in private storage, with a retention policy. Credentials stay in CI secrets.
- **Blob:** document what's stored (screenshots, proposals, CSVs) and the retention; back up the proposals and handoffs if the plan requires it.
- **A restore drill (required):**
  1. restore last night's backup into a fresh Neon branch
  2. point a preview deployment at it
  3. sign in and verify the data
  4. record the time taken and the steps in the runbook
- **The encryption key and 2FA recovery codes** are in the password manager. Confirm this with me.

---

## Step 7: Production verification

- Run the Phase 19 **`@smoke`** suite against production with a dedicated test user, excluding any real send.
- Vercel Speed Insights, and a Lighthouse run against production.
- Check that crons fire: watch `/admin/jobs` for a full day's schedule.
- Check that `/admin` shows every integration green, and that every mailbox is warming with DNS green.

---

## Step 8: Documentation and team onboarding

1. **`docs/runbook.md`,** covering:
   - deploy
   - **rollback** (Vercel instant rollback plus migration compatibility rules)
   - database restore (the drill steps)
   - rotating keys (`credentials:rotate`, `CRON_SECRET`, provider keys, the unsubscribe secret)
   - **the global outreach kill switch:** when and how
   - incidents:
     - a mailbox blacklisted or high bounces
     - an AI cost spike
     - a provider outage
     - a stuck pipeline
     - a suspected data breach: containment steps and the NDPA notification duty (verified timeframe), plus UK GDPR where UK data is involved
   - who owns what
   - the warm-up calendar and the DMARC tightening dates
2. **`docs/onboarding.md`,** per role (Admin, Manager, Service Lead, Member):
   - the daily workflow
   - running searches and saved searches
   - **the review queue and its shortcuts**
   - the WhatsApp send-and-confirm flow
   - inbox classes and SLAs
   - the pipeline and proposals
   - reading analytics
   - editing profiles safely (drafts, preview, publish, rollback)
   - what never to do (buying lists, emailing sole traders in the UK, sending outside the platform)
   - Keep it short, practical and illustrated with screenshots captured through Playwright MCP from the staging data.
3. **The handover pack** (saas-ship templates):
   - the README
   - an admin guide
   - the environment and credential checklist (names only, never values)
   - known limitations
   - architecture links

---

## Step 9: The launch gates, then launch

Write `docs/launch-checklist.md`, and **go through it with me item by item.** Real outreach starts only when **every** gate is ticked:

- [ ] Phase 20's "Needs a human decision" list is resolved:
  - legal review of the country rules and compliance approach done or accepted
  - **pricing confirmed** in every profile (`needsReview` cleared)
  - **real portfolio items** added (no placeholders pitched)
  - budgets approved
- [ ] The postal address is set, and the unsubscribe has been tested from real inboxes.
- [ ] All outreach domains are DNS-green, **warm-up complete** per the calendar, and inbox placement tests acceptable.
- [ ] Every integration is green, and backups plus the restore drill are done.
- [ ] Monitoring and alerts have been tested (trigger a test alert).
- [ ] The team is onboarded, and each line has an owner with capacity set.
- [ ] Every profile is in `ALWAYS_REVIEW` for launch, with low daily first-touch caps (for example 10 per line per day for the first two weeks).
- [ ] The kill switch has been tested.

When every box is ticked and I say go:

1. **turn the kill switch off**
2. start with one line per market for the first 3 days, then all lines
3. record the launch in `docs/go-live-log.md`

Propose a **two-week post-launch plan:** daily checks of bounce rate, reply classification accuracy (spot-check 20 a day), AI spend, and the review queue size; when to raise caps; when to consider `AUTO_SEND_ABOVE_SCORE` for low-risk segments.

---

## Constraints

- **No real prospect is contacted before the launch gates pass.**
- **Never ask for secret values in chat,** and never commit secrets.
- **Stop for my decision** at every account, purchase, DNS, spend or launch step.
- **Never commit or merge** unless I ask. Deploys to production happen only with my explicit go-ahead at each step.

---

## Done when

- [ ] Production runs on Vercel Pro with Neon, Blob, Workflow and cron. Previews use Neon branches and mocks. Migrations run through CI.
- [ ] Every real provider is switched on and verified, one at a time, and recorded in `docs/go-live-log.md`, with the cost model updated.
- [ ] The platform and outreach domains are configured, DNS-green and warming up on a dated calendar.
- [ ] Monitoring, alerts and spend limits are live and tested.
- [ ] Backups are running, and the restore drill passed.
- [ ] The production smoke suite passes.
- [ ] `docs/runbook.md`, `docs/onboarding.md`, the handover pack and `docs/launch-checklist.md` are complete.
- [ ] The launch gates were reviewed with me, and launch happened only on my go-ahead, following the staged plan.
- [ ] `phases/21/SUMMARY.md` is written. **The build is complete.**
