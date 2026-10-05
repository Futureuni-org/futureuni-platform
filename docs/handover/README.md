# Handover pack

Everything needed to own and run the FUTUREUNI Internal Platform after the build.

## Start here
- **Operate it:** `docs/runbook.md` (deploy, rollback, restore, key rotation, kill switch, incidents, warm-up).
- **Launch it:** `docs/launch-checklist.md` (the go-live gates) and `docs/go-live-log.md` (the record).
- **Use it:** `docs/onboarding.md` (per role).
- **Understand it:** `docs/architecture.md` (system map, pipeline, events, invariants), `docs/schedules.md` (jobs), `docs/specs/*`, `docs/decisions.md` (ADRs), `docs/integrations.md`.
- **Cost + security:** `docs/cost-model.md`, `docs/hardening-report.md`.
- **Accounts + environment:** `docs/handover/accounts-and-env.md`.

## Admin guide (quick)
- Admin screens: `/admin/{users,team,integrations,mailboxes,suppression,data-requests,prompts,ai-usage,jobs,audit,platform}`.
- First run after deploy: `pnpm bootstrap:admin` (sets the kill switch ON + low caps), then `pnpm create-admin` (first ADMIN with a login — see the runbook "First admin"), then sign in and set 2FA.
- The **global outreach kill switch** is `acquisition.outreach.globalPause` in `/admin/platform` — on until launch, and your fastest "stop everything" control.
- Jobs + schedules: `/admin/jobs` and `docs/schedules.md`. One cron tick drives everything.

## Known limitations (carried forward — honest state)
- **Phase 19:** the full end-to-end Playwright suite (8 journeys, branches, role matrix, `@smoke`) was not authored, and the eval-runner crash (below) was not fixed. See `phases/19/SUMMARY.md`.
- **Phase 20:** security hardening (SEC-1…5), the kill-switch banner, the INV traceability matrix, and the cost model are done; the DSR/retention, AI-quota, chaos and red-team **tests** and several INV-gap tests are feasible follow-ups; the browser/perf/accessibility/dependency-scan/live-eval steps are **environment-gated** (listed in `docs/hardening-report.md` §7). See `phases/20/SUMMARY.md`.
- **Phase 21:** this prep package is authored; the **live go-live is owner-executed** per the launch checklist (accounts, domains/DNS, secrets, deploys, provider switch-on, warm-up, monitoring, restore drill, launch gates).
- **Eval-runner:** fixed post-review — `@/platform/auth/session.ts` now lazy-imports `redirect`, so `pnpm evals` boots and runs (it had crashed under tsx `--conditions=react-server` because the static `next/navigation` client import was reachable from the manifest). See `docs/hardening-report.md` §5.
- **Transports (go-live):** the SMTP + IMAP fallbacks are stubs; production uses the Gmail API path (ADR-016). Inbound webhook OIDC and the Cal.com/font-bundling items are tracked for go-live (see the phase REQUESTS indexes).

## Repo + commands
- `README.md` (setup), `AGENTS.md` (Next.js 16 notes), `CLAUDE.md` (module system + ownership), `.claude/project-rules.md` (rules/brand/invariants).
- CI: `.github/workflows/ci.yml` (lint/typecheck/test/build + ownership + registry), `deploy.yml` (production migration gate), `backup.yml` (nightly encrypted dump).
- Key commands: `pnpm check`, `pnpm test:e2e`, `pnpm db:deploy`, `pnpm registry:gen`, `pnpm seed:staging`, `pnpm bootstrap:admin`.
