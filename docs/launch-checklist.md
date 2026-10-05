# Launch checklist

No real prospect is contacted until **every** box below is ticked and Prince says go (project-rules §Launch gates). Until then, `acquisition.outreach.globalPause = true` in production (set by `pnpm bootstrap:admin`). Work top to bottom. Each item names the exact command or screen.

## A. Human decisions (from the hardening report §6)
- [ ] **Legal review** of the country-rules table and the NDPA/PECR/GDPR approach by a qualified person — done or formally accepted. (`docs/hardening-report.md` §2d; `src/modules/acquisition/compliance/country-rules.ts`.)
- [ ] **Pricing confirmed** in every service-line profile — every `needsReview` price cleared (`/acquisition/<line>/settings`).
- [ ] **Real portfolio items** added for every line — no `isPlaceholder` items can be pitched (INV-19).
- [ ] **AI budgets approved** and set in `/admin/ai-usage` (conservative launch values from `docs/cost-model.md`).
- [ ] **Postal address** set (`platform.postalAddress`) — outbound email is blocked without it (INV-4).

## B. Accounts, environments, secrets (runbook §Deploy)
- [ ] All accounts created/confirmed (`docs/handover/accounts-and-env.md`).
- [ ] Every `src/env.ts` variable set per environment in Vercel; secrets pasted into the Vercel dashboard (never chat).
- [ ] `CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`, `BOOKING_LINK_SECRET`, `SUPPRESSION_HASH_KEY` generated; the encryption key + 2FA recovery codes stored in the team password manager (irrecoverable if lost).
- [ ] Production deploy from `main` with `MOCKS=false`; previews on Neon branches with `MOCKS=true` + `seed:staging`, behind deployment protection.
- [ ] `pnpm bootstrap:admin` run once against production (kill switch ON, low caps set); first ADMIN created and 2FA set up.
- [ ] CI migration gate green (`.github/workflows/deploy.yml` applied migrations before the production deploy).
- [ ] Phase-20 security headers + CSP confirmed on the production domain, `noindex` present, deployment protection on previews.

## C. Domains, DNS, warm-up (runbook §Domains)
- [ ] Platform domain (`app.<domain>`) on Vercel with HTTPS.
- [ ] Platform email (Resend) sending subdomain: SPF, DKIM, DMARC verified in Resend.
- [ ] 2–3 outreach domains, each with MX, SPF (provider only), DKIM, DMARC (`p=none` → `quarantine` per the dated calendar); website redirects to the main site; 1–2 mailboxes each with real staff sender names (consented).
- [ ] `/admin/mailboxes` DNS check **all green**.
- [ ] Warm-up **complete** per the dated calendar (runbook §Warm-up); inbox-placement test acceptable (mail-tester-style, scores recorded in `docs/go-live-log.md`).

## D. Providers, monitoring, backups
- [ ] Every real provider switched on one at a time and verified, recorded in `docs/go-live-log.md`; cost model updated with real per-lead cost.
- [ ] Every integration **green** in `/admin/integrations`.
- [ ] Sentry (server + client) with PII scrubbing, releases, environment tags.
- [ ] Uptime check on `/api/health` and the sign-in page.
- [ ] Alerts wired + **tested** (trigger one): error spike, job-failure/dead-letters, AI budget 80%/100%, mailbox paused, bounce spike, integration failing, cron tick missing > 15 min.
- [ ] Spend limits set: Vercel spend management, Anthropic monthly, Google Cloud budget alerts, provider caps (recorded in the runbook).
- [ ] Nightly backup running (`.github/workflows/backup.yml`); **restore drill passed** (runbook §Restore drill) with the time recorded.

## E. Verification (owner runs against the live deployment)
- [ ] Production `@smoke` suite passes with a dedicated test user, **no real send**: `E2E_BASE_URL=<prod> pnpm test:e2e --grep @smoke`.
- [ ] Lighthouse against production meets the budgets (LCP < 2.5s, CLS < 0.1, INP < 200ms on mid-range mobile); fix regressions.
- [ ] `axe` clean (zero serious/critical) on the key routes in both themes.
- [ ] Crons fire: watch `/admin/jobs` for a full day's schedule (`docs/schedules.md`).

## F. Team & launch posture
- [ ] Team onboarded (`docs/onboarding.md`); each line has an owner with capacity set (`/admin/team`).
- [ ] Every profile in `ALWAYS_REVIEW` for launch, low daily first-touch caps (≈10/line/day for the first two weeks).
- [ ] **Kill switch tested** (toggle on → banner shows + sends blocked; off → resumes).

## G. Launch (only on Prince's go)
1. Turn the kill switch off (`acquisition.outreach.globalPause = false` in `/admin/platform`).
2. Start with **one line per market for the first 3 days**, then all lines.
3. Record the launch in `docs/go-live-log.md`.
4. Run the **two-week post-launch plan** (runbook §Post-launch): daily bounce rate, reply-classification spot-check (20/day), AI spend, review-queue size; when to raise caps; when to consider `AUTO_SEND_ABOVE_SCORE` for low-risk segments.

**When every box is ticked and launch has happened, the build is complete.**
