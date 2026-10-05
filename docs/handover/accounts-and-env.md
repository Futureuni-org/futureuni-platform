# Accounts & environment checklist

**Names only — never paste secret values here or in chat.** Secrets go directly into the Vercel dashboard (per environment) or the platform's `/admin/integrations` credentials screen. Monthly costs are estimates from `docs/cost-model.md`; confirm on signup.

## As provisioned (2026-10-05, Hobby interim)
The first live bring-up runs on **Vercel Hobby** (non-commercial — move to Pro before real commercial use; see `docs/runbook.md` Hobby caveats). Concrete resources:

| Resource | Identity |
|---|---|
| GitHub repo | `Futureuni-org/futureuni-platform` (private) |
| Vercel team | **freelancer-prince** (`team_nw52uMh78uLfNOHf44N3h2e6`) |
| Vercel project | **futureuni-platform** (`prj_z3UlhHuCHTkz8Xx3PSbcgpFhJQwZ`), region `iad1` |
| Neon project | **futureuni-platform-prod** (`shy-haze-64077894`), `aws-us-east-1`, PG 17, branch `production`, db `futureuni`, role `futureuni_app`, PITR 6h |
| Vercel Blob | **futureuni-blob** (`store_0poXteogghFl5h6i`), private, `iad1` |
| Scheduler | cron-job.org → `GET /api/cron/tick` every 5 min (Hobby has no usable Vercel Cron) |

Already set (non-secret): `MOCKS=true` (bring-up; flip to `false` after provider keys), `STORAGE_DRIVER=vercel-blob`, `BLOB_READ_WRITE_TOKEN` (from the Blob store).

## Accounts (FUTUREUNI company accounts, not personal)
| Account | Purpose | Plan/tier | Est. monthly | Owner |
|---|---|---|---|---|
| GitHub organisation | Repo + CI + Actions (migration gate, backup) | Team/Free | ~$0–4/user | |
| Vercel Pro team | Hosting, Fluid Compute, cron, Workflow, Blob, deployment protection, spend mgmt | Pro | ~$20 base | |
| Neon (via Vercel Marketplace) | Postgres, preview branches, PITR | paid (for PITR window) | ~$19 | |
| Vercel Blob | Private file storage (screenshots, proposals, CSVs) | usage | small | |
| Domain registrar | Platform domain + 2–3 outreach domains | per-domain | ~$10–15/domain/yr | |
| Google Workspace (outreach, ADR-016) | Outreach mailboxes + Gmail API | Business Starter | ~$7/mailbox | |
| Resend (ADR-023) | Platform (transactional) email | Free/Pro | ~$0–20 | |
| Anthropic | AI (set a spend limit) | pay-as-you-go | variable (cost model) | |
| Google Cloud project | Places, PageSpeed, YouTube Data (**restrict API keys + billing budget alert**) | pay-as-you-go | small | |
| SerpAPI | Search sourcing | paid | per plan | |
| Adzuna | Job-post sourcing | free/paid | ~$0 | |
| Hunter (or Apollo) | Email enrichment | paid | per plan | |
| Companies House | UK legal-form lookups | free | $0 | |
| Cal.com (or Google Calendar) | Meeting booking + webhook | Free/Pro | ~$0–15 | |
| Sentry | Error monitoring (PII scrubbing) | Team | ~$0–26 | |
| Uptime monitor | `/api/health` + sign-in (or Vercel's own) | Free | ~$0 | |
| Team password manager | `CREDENTIALS_ENCRYPTION_KEY`, 2FA recovery codes, backup decryption key | Team | ~$0–5/user | |

## Environment variables (`src/env.ts`)
Set each per environment in Vercel (Development/Preview/Production). `S` = secret (dashboard only). Preview uses `MOCKS=true`; production `MOCKS=false`. Vercel sets `VERCEL*` itself.

| Variable | S | Notes |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | | public app URL |
| `NEXT_PUBLIC_SENTRY_DSN` | | optional, public |
| `MOCKS` | | `false` in production only |
| `DATABASE_URL` / `DIRECT_URL` | S | Neon pooled / direct (direct for migrations) |
| `DATABASE_URL_TEST` | S | CI/test only |
| `CREDENTIALS_ENCRYPTION_KEY` | S | 32 bytes base64 — **store in password manager; irrecoverable if lost** |
| `CREDENTIALS_KEY_VERSION` | | integer, starts 1 |
| `CRON_SECRET` | S | guards `/api/cron/*` |
| `UNSUBSCRIBE_TOKEN_SECRET` | S | |
| `BOOKING_LINK_SECRET` | S | |
| `SUPPRESSION_HASH_KEY` | S | |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | S / | auth |
| `AUTH_GOOGLE_ENABLED` + `GOOGLE_OAUTH_CLIENT_ID/SECRET` | /S | optional Google sign-in |
| `ANTHROPIC_API_KEY` + `AI_MODEL_*` | S / | AI (models in config, ADR-018) |
| `EVALS_LIVE_MAX_USD` | | live-eval spend cap |
| `STORAGE_DRIVER` (`vercel-blob`) + `BLOB_READ_WRITE_TOKEN` | /S | prod storage |
| `RESEND_API_KEY` + `EMAIL_FROM` / `EMAIL_REPLY_TO` | S / | platform email |
| `OUTREACH_SENDER` (`gmail-api`) + `INBOUND_SOURCE` (`gmail-api`) + `GOOGLE_WORKSPACE_OAUTH_CLIENT_ID/SECRET` | /S | outreach |
| `GOOGLE_PLACES_API_KEY`, `SERPAPI_API_KEY`, `ADZUNA_APP_ID/KEY`, `YOUTUBE_API_KEY` | S | sourcing |
| `HUNTER_API_KEY`, `COMPANIES_HOUSE_API_KEY` | S | enrichment/compliance |
| `PAGESPEED_API_KEY`, `BROWSER_RUNTIME` + runtime vars | S / | audits (ADR-017) |
| `CALCOM_API_KEY` / `CALCOM_WEBHOOK_SECRET` | S | booking |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | S/ | monitoring |

Provider keys are optional while `MOCKS=true`; the production deployment (`MOCKS=false`) requires the ones for the providers you've switched on (ADR-005). Prefer storing provider keys in the **credentials vault** (`/admin/integrations`) over env where the code reads the vault first.

## GitHub Actions secrets (CI, "production" environment)
`PRODUCTION_DIRECT_URL` (unpooled Neon URL, for the migration gate + nightly backup) and `BACKUP_AGE_RECIPIENT` (an `age` public key; the private key stays in the password manager).
