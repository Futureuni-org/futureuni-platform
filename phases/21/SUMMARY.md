# Phase 21: Deploy & Go-Live: Summary

| | |
|---|---|
| Phase | 21, Deploy and Go-Live |
| Branch | `phase/21-go-live` (off `main` after Phase 20 merged) |
| Batch / wave | B7 / Wave 5 (sequential, final) |
| Date finished | 2026-10-05 (preparation package — the live launch is owner-executed) |
| Prompt | `docs/prompts/wave-5/phase-21-go-live.md` |
| Verification | `tsc --noEmit`: Pass (0) · `eslint`: clean (bootstrap script + config) · `vercel.json`/`package.json`: valid JSON · bootstrap guard: refuses outside production · **Live steps (deploy, accounts, DNS, provider switch-on, warm-up, monitoring, restore drill, launch gates): owner-executed, not run here** |

## What was built

The complete **go-live preparation package** so Prince can take the platform to production by following the docs. Everything executable in this environment is authored and verified; every live/owner/spend step is documented with click-by-click instructions and gated behind the launch checklist.

- **Deploy config:** `vercel.json` gains a function region (`lhr1`, kept next to Neon) alongside the single cron tick. A CI **production migration gate** (`.github/workflows/deploy.yml`) runs `prisma migrate deploy` against `DIRECT_URL` before the production deploy serves. A **nightly encrypted logical backup** (`.github/workflows/backup.yml`): `pg_dump` → `age` encryption → retained artifact (Blob/offsite upgrade documented).
- **`pnpm bootstrap:admin`** (`scripts/bootstrap-admin.ts`): production-only guard (never the dev seed), sets the launch-safety defaults idempotently (**outreach kill switch ON**, low first-touch cap), validated against the registered setting schemas, and reports/instructs on the first admin.
- **Docs:** `docs/launch-checklist.md` (the go-live gates, each with the exact command/screen), `docs/runbook.md` (deploy, rollback, restore drill, key rotation, kill switch, incidents incl. the **verified NDPA 72-hour** breach duty + Gmail/Yahoo rules, warm-up + DMARC calendar, spend limits, ownership), `docs/onboarding.md` (per role, screenshot placeholders), `docs/go-live-log.md` (switch-on + launch record skeleton), and the handover pack (`docs/handover/README.md`, `docs/handover/accounts-and-env.md`).

## Files created / changed

| Path | Purpose |
|---|---|
| `vercel.json` | Function region + cron tick |
| `.github/workflows/deploy.yml` | Production migration gate (`db:deploy` before promote) |
| `.github/workflows/backup.yml` | Nightly `pg_dump` → `age`-encrypted retained backup |
| `scripts/bootstrap-admin.ts` + `package.json` (`bootstrap:admin`) | Production safety defaults + first-admin bootstrap |
| `docs/launch-checklist.md`, `docs/runbook.md`, `docs/onboarding.md`, `docs/go-live-log.md` | Launch + operations + onboarding + record |
| `docs/handover/README.md`, `docs/handover/accounts-and-env.md` | Handover pack: index, admin guide, known limitations, accounts + env checklist |

## Decisions made
- **Prep + merge, owner runs live** (confirmed): this sandbox can't create accounts, buy domains/DNS, hold real secrets, deploy to Vercel/Neon, switch providers, warm up mailboxes, or run prod smoke/Lighthouse/axe — all of which the prompt mandates stopping for. I authored everything executable + verified it + merged; the owner executes the live steps via the docs.
- **Region `lhr1`** (London) as the default, to sit next to the Neon region (UK-close, acceptable to Nigeria); keep the two aligned.
- **Backup** kept as an `age`-encrypted retained artifact for v1 (simple, no extra token/script), with the Blob/offsite upgrade documented — Neon PITR is the primary recovery path.
- **Bootstrap scope:** sets the launch-safety settings robustly (the clearly-correct, high-value part); the first-admin **invite** needs an unauthenticated bootstrap helper in `@/platform/auth` (the normal `createInvite` requires an existing inviter) — noted as a small follow-up, with the runbook covering admin creation meanwhile.
- **NDPA 72-hour** breach-notification duty and the **Gmail/Yahoo 2024** sender rules were verified against current sources and cited in the runbook (not asserted from memory).

## Dependencies added
None. (The backup workflow uses `pg_dump` + `age`, installed in CI.)

## Known limitations
The live go-live itself (Steps 1–7, 9 of the prompt) is owner-executed and gated by `docs/launch-checklist.md`; it is not run here. Onboarding screenshots are placeholders to capture from staging when the app runs. The first-admin invite helper, and all Phase 19/20 carried-forward items (e2e suite, eval-runner fix, the feasible follow-up tests, the environment-gated security/perf/a11y runs), are listed in `docs/handover/README.md` and the respective phase summaries.

## How to test it
- `tsc --noEmit`; `eslint scripts/bootstrap-admin.ts`; `node --import tsx scripts/bootstrap-admin.ts` (refuses outside production).
- The live platform is verified by the owner against the launch checklist §E (prod `@smoke`, Lighthouse, axe, crons) before launch.

**The build is code-complete and launch-ready. It is live/complete when the launch checklist passes and Prince gives the go-ahead.**
