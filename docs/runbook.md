# Runbook

Operating the FUTUREUNI platform in production. Pair with `docs/launch-checklist.md` (go-live gates), `docs/architecture.md` (how it fits together), `docs/schedules.md` (jobs), `docs/cost-model.md` and `docs/hardening-report.md`.

**Hosting:** Vercel Pro (Next.js 16, Fluid Compute, functions in `lhr1` — chosen to sit next to the Neon database; keep the two regions aligned). Neon Postgres (pooled `DATABASE_URL` at runtime, direct `DIRECT_URL` for migrations). Vercel Blob (private). Vercel Workflow + one Cron tick (`/api/cron/tick`, every 5 min). Verify current plan details against the Vercel + Neon docs before relying on a limit.

## Deploy
- Production deploys from `main` only, `MOCKS=false`. Previews deploy per branch with a Neon branch, `MOCKS=true` and `seed:staging`, behind Vercel deployment protection.
- **Migrations never run from a laptop against production.** `.github/workflows/deploy.yml` runs `pnpm db:deploy` (`prisma migrate deploy` against `DIRECT_URL`) on push to `main` before the deployment serves. Make it a required check for production promotion (Vercel → Git → Required checks), or promote via the Vercel CLI after it passes.
- **Migration compatibility (saas-data):** follow expand → migrate → contract, so a migration is compatible with the code currently serving. Never ship a destructive migration in the same deploy as the code that needs the new shape.
- **Preview branches** migrate their own Neon branch: the preview build runs `pnpm db:deploy` against the preview `DIRECT_URL`.

## Rollback
- **Code:** Vercel instant rollback — promote the previous production deployment from the Vercel dashboard. Instant; no rebuild.
- **With a migration:** because migrations are expand→migrate→contract, the previous deployment stays compatible with the migrated DB, so a code rollback is safe. Never roll a migration back by hand on production; roll forward with a new corrective migration, or restore (below) if data is affected.

## Database restore drill (run before launch; repeat quarterly)
Primary recovery is **Neon point-in-time restore** (confirm the retention window on the current plan and record it here: ____). Belt-and-braces: the nightly encrypted logical dump (`.github/workflows/backup.yml`).
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
