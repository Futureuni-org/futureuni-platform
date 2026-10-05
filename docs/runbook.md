# Runbook

Operating the FUTUREUNI platform in production. Pair with `docs/launch-checklist.md` (go-live gates), `docs/architecture.md` (how it fits together), `docs/schedules.md` (jobs), `docs/cost-model.md` and `docs/hardening-report.md`.

**Hosting (current — Vercel Hobby):** Next.js 16 on Fluid Compute, functions in the default region `iad1` (US-East). Neon Postgres project `futureuni-platform-prod` (`shy-haze-64077894`) in `aws-us-east-1` — co-located with `iad1` — pooled `DATABASE_URL` at runtime, direct `DIRECT_URL` for migrations. Vercel Blob (private, store `futureuni-blob`, `iad1`). The 5-minute tick (`/api/cron/tick`) is driven by an **external scheduler** (cron-job.org), because Hobby crons are capped at 2 jobs **once per day** — see "Scheduler" below.

> **Hobby caveats (resolve before real commercial use):**
> - **Non-commercial ToS.** Vercel's Hobby tier is for personal, non-commercial use ([terms](https://vercel.com/terms)). A commercial client-acquisition tool should move to **Pro** before launch; this is an accepted, documented interim.
> - **Region is pinned to `iad1`.** Function region selection (e.g. `lhr1`, next to a London DB) is a Pro feature, so `vercel.json` carries no `regions` and the DB lives in US-East to match. Revisit on Pro.
> - **No Vercel Cron.** The every-5-min schedule runs via cron-job.org hitting the tick endpoint; Vercel Cron takes over automatically once `crons` is restored to `vercel.json` on Pro.

## Deploy
- **Git connection (one-time):** the project (`futureuni-platform`, team `freelancer-prince`) deploys from the GitHub repo `Futureuni-org/futureuni-platform`. Install the **Vercel GitHub app** on the `Futureuni-org` org and grant it that repo (Vercel dashboard → the project → Connect Git), then every push to `main` deploys.
- Production deploys from `main`. **Initial bring-up runs `MOCKS=true`** (real DB + auth, mocked external providers) so the build is green without every provider key and no real prospect is contacted; flip `MOCKS=false` only after the Step-4 provider switch-on sets all keys (`PRODUCTION_PROVIDER_KEYS` in `src/env.ts`). Previews deploy per branch with a Neon branch, `MOCKS=true` and `seed:staging`, behind Vercel deployment protection.
- **Migrations never run from a laptop against production.** `.github/workflows/deploy.yml` runs `pnpm db:deploy` (`prisma migrate deploy` against `DIRECT_URL`) on push to `main` before the deployment serves. Make it a required check for production promotion (Vercel → Git → Required checks), or promote via the Vercel CLI after it passes.
- **Migration compatibility (saas-data):** follow expand → migrate → contract, so a migration is compatible with the code currently serving. Never ship a destructive migration in the same deploy as the code that needs the new shape.
- **Preview branches** migrate their own Neon branch: the preview build runs `pnpm db:deploy` against the preview `DIRECT_URL`.

## Scheduler (the 5-minute tick)
The whole engine (lead-advance sweeper, outreach tick, inbox poll, mailbox health, digests — everything in `docs/schedules.md`) is driven by one endpoint, `GET /api/cron/tick`, which asks the dispatcher which manifest schedules are due in the current 5-minute slot. The slot key makes a double-delivery a no-op (INV-22), so a scheduler that occasionally fires twice or late is safe.

On Hobby this is an **external scheduler** — set up [cron-job.org](https://console.cron-job.org) (free, 1-minute granularity, custom headers):
1. Create a cronjob: URL `https://<production-domain>/api/cron/tick`, **method GET**, schedule **every 5 minutes**.
2. Add a request header **`Authorization: Bearer <CRON_SECRET>`** — paste the same secret that is set as `CRON_SECRET` in Vercel. *(The secret goes into cron-job.org's header field, never into chat or the repo.)*
3. Enable "save responses" and set a failure notification to the ops email. A 401 means the secret is wrong; a 200 returns the dispatch summary.
4. **Monitor:** alert if no successful tick in ~15 min (3 missed slots). cron-job.org's own failure alert covers this; mirror it in uptime monitoring.

Alternatives considered and rejected: **Vercel Cron** (Hobby = 2 jobs/day, too coarse) and **GitHub Actions** (a `*/5` schedule on a private repo bills a 1-min minimum per run ≈ 8,600 min/month vs. the 2,000-min free allowance, and its timing is unreliable). On upgrade to **Pro**, restore `"crons": [{ "path": "/api/cron/tick", "schedule": "*/5 * * * *" }]` to `vercel.json` and disable the cron-job.org job.

## Rollback
- **Code:** Vercel instant rollback — promote the previous production deployment from the Vercel dashboard. Instant; no rebuild.
- **With a migration:** because migrations are expand→migrate→contract, the previous deployment stays compatible with the migrated DB, so a code rollback is safe. Never roll a migration back by hand on production; roll forward with a new corrective migration, or restore (below) if data is affected.

## Database restore drill (run before launch; repeat quarterly)
Primary recovery is **Neon point-in-time restore** (current retention window: **6 hours** — `history_retention_seconds=21600` on the free tier; raise it on a paid Neon plan and update here). Belt-and-braces: the nightly encrypted logical dump (`.github/workflows/backup.yml`).
1. In Neon, create a **branch** restored to last night (PITR) — or decrypt the latest dump (`age -d -i <key> backup.sql.age | pg_restore …`) into a fresh Neon branch.
2. Point a **preview deployment** at that branch's `DATABASE_URL`/`DIRECT_URL`.
3. Sign in and verify the data (leads, settings, a proposal).
4. **Record the time taken and the exact steps here.** Target: < 30 min.

The decryption key for the dumps and the `CREDENTIALS_ENCRYPTION_KEY` + 2FA recovery codes live only in the team password manager.

## Rotating keys
- **Provider credentials:** `/admin/integrations` → replace; or `pnpm credentials:rotate`. Stored AES-256-GCM (INV-21); the UI only ever shows masked values.
- **`CREDENTIALS_ENCRYPTION_KEY`:** bump `CREDENTIALS_KEY_VERSION`, re-encrypt with `credentials:rotate`. **Losing the key makes every stored credential unrecoverable** — it stays in the password manager.
- **`CRON_SECRET`, `UNSUBSCRIBE_TOKEN_SECRET`, `BOOKING_LINK_SECRET`, `SUPPRESSION_HASH_KEY`:** rotate in Vercel env; note that changing the unsubscribe/booking secrets invalidates outstanding signed links (acceptable; they regenerate).

## The global outreach kill switch
- Setting `acquisition.outreach.globalPause` (ADMIN, `/admin/platform`). When ON: no email sends, no assisted links generated, drafts still reviewable, and a **platform-wide banner** shows on every page (`src/components/shell/outreach-paused-banner.tsx`). Enforced in `outreach/email/send.ts` + `outreach/assisted/assisted.ts`.
- **Use it** the moment outreach misbehaves (bounce spike, wrong sends, a complaint, a provider incident). It is ON by default until the launch checklist is green.

## Warm-up calendar (outreach domains) and DMARC tightening
Start each mailbox at the Phase-12 warm-up ramp; grow genuine sending gradually. Fill in real dates at launch:

| Week | Per-mailbox daily cap | DMARC |
|---|---|---|
| 1 (dates: __) | ~5–10 | `p=none` with `rua` reporting |
| 2 (__) | ~15–25 | `p=none`, review reports |
| 3 (__) | ~30–40 | move to `p=quarantine` |
| 4+ (__) | target (Phase-12 `dailyCapTarget`) | `p=quarantine` (consider `p=reject` later) |

Run an inbox-placement test (mail-tester-style) at the end of week 1 and before launch; record scores in `docs/go-live-log.md`. **Gmail/Yahoo bulk-sender rules (verified Jan 2024):** aligned SPF + DKIM + DMARC, RFC 8058 one-click unsubscribe honored within 2 days, and keep the spam-complaint rate **under 0.3%** (aim < 0.1%); "bulk" ≈ 5,000/day to Gmail. Sources: [Google/Yahoo requirements (Resend)](https://resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024), [dmarcian](https://dmarcian.com/yahoo-and-google-dmarc-required/).

## Spend protection (record the live limits)
Vercel spend management cap: ____. Anthropic monthly limit: ____. Google Cloud budget alert: ____. Provider caps (sourcing/enrichment/audit) are in settings (see `docs/cost-model.md` §4). Review monthly against `AiCall.costMicros` + `ProviderUsage`.

## Incidents
- **Mailbox blacklisted / high bounces:** the health job auto-pauses the mailbox; confirm, pause the line or the global kill switch, investigate the list/content, warm back up. Check the bounce-rate alert.
- **AI cost spike:** `/admin/ai-usage`; the budget caps block at 100% (`AI_QUOTA_EXCEEDED`). Lower the daily budget; check for a runaway job in `/admin/jobs`.
- **Provider outage:** the circuit breaker opens and leads wait (`AI_*`/`PROVIDER_ERROR`); work continues on other providers; it resumes on recovery. Switch the provider's adapter to mock only as a last resort.
- **Stuck pipeline:** the advance sweeper re-advances stuck leads every 30 min and flags the exhausted ones (`lead.needsAttention`); check `/admin/jobs` for failures and retry.
- **Suspected data breach:** contain (rotate affected keys, pause outreach via the kill switch, revoke sessions), assess the risk to data subjects, and — where the breach is likely to risk individuals' rights — **notify the NDPC within 72 hours of becoming aware** (NDPA 2023). Where UK personal data is involved, apply UK GDPR (ICO, 72 hours) too. Record the timeline. Sources: [NDPA breach duty (mondaq)](https://mondaq.com/nigeria/data-protection/1371660/data-breaches-compliance-obligations-under-the-nigerian-data-protection-act-2023), [PwC NG regulatory alert](https://pwc.com/ng/en/assets/pdf/regulatory-alert-august-2023.pdf). (Not legal advice — confirm with counsel.)

## Post-launch (two weeks)
Daily: bounce rate, reply-classification accuracy (spot-check 20), AI spend, review-queue size. Raise first-touch caps only when bounces stay low and placement is good. Consider `AUTO_SEND_ABOVE_SCORE` for low-risk segments only after the team is confident.

## Who owns what
| Area | Owner |
|---|---|
| Vercel/Neon/deploys, env + secrets | ____ (admin) |
| Domains/DNS, mailboxes, warm-up | ____ |
| AI budgets + cost | ____ (admin) |
| Legal/compliance sign-off | ____ |
| Each service line (capacity, profiles) | the line's `SERVICE_LEAD` |
