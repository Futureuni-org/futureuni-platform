# Phase 20: Hardening: Summary

| | |
|---|---|
| Phase | 20, Hardening |
| Branch | `phase/20-hardening` (off `main` after Phase 19 merged) |
| Batch / wave | B7 / Wave 5 (sequential) |
| Date finished | 2026-10-05 (feasible subset — see Known limitations) |
| Prompt | `docs/prompts/wave-5/phase-20-hardening.md` |
| Verification | `tsc --noEmit`: Pass (0) · `eslint .`: Pass · targeted `vitest`: Pass · `saas-review`: no open Critical/Major in the reviewed+tested scope · `pnpm build` / `pnpm test:e2e` / Lighthouse / axe / `pnpm audit` / gitleaks / live evals: **Not run — environment-gated** (see `docs/hardening-report.md` §7) |

## What was built

A full-repository hardening pass (feasible subset, this environment). **Security:** added the previously-absent security headers + a nonce-based CSP (`src/proxy.ts`), an authorization-coverage gate over every route handler and server action (`tests/integration/authz-coverage.test.ts` — confirmed the whole surface already self-authorizes, and now fails CI if it grows unguarded), a constant-time webhook token compare, extra SSRF cases, and a PII-redaction layer on the structured logger. **Compliance:** a complete INV-1…25 traceability matrix and the global kill-switch review in `docs/hardening-report.md`. The report also diagnoses the eval-runner crash to root cause and lists, precisely, the remaining feasible tests, the environment-gated steps, and the "needs a human decision before launch" items. As Phase-20 prep, Phase 19 was committed and merged to `main` (`e69c15f`) and recorded in the ledger.

## Files and folders created / changed

| Path | Purpose |
|---|---|
| `src/proxy.ts` | SEC-2: nonce CSP + HSTS/nosniff/referrer/permissions/frame-ancestors/noindex on every response |
| `src/proxy.test.ts` | SEC-2 test |
| `src/app/api/webhooks/inbound/[provider]/route.ts` | SEC-3: constant-time `tokenMatches` |
| `src/app/api/webhooks/inbound/[provider]/route.test.ts` | SEC-3 test |
| `src/platform/audit-log/redact.ts` | SEC-5: `redactLogData` (PII keys + email/E.164 masking) |
| `src/platform/audit-log/log-redact.test.ts` | SEC-5 test |
| `src/platform/jobs/runtime.ts` | SEC-5: route `makeLogger` through `redactLogData` |
| `src/platform/http/ssrf.test.ts` | SEC-4: IPv6-metadata / IPv4-mapped cases |
| `tests/integration/authz-coverage.test.ts` | SEC-1: endpoint authorization coverage gate |
| `src/components/shell/outreach-paused-banner.tsx` (+ `.test.tsx`), `shell-layout.tsx` | COMP-3: global kill-switch banner on every signed-in page |
| `docs/cost-model.md` | Step 5.3: per-lead + monthly cost model with marked assumptions |
| `docs/hardening-report.md` | The report: SEC findings, INV traceability matrix, kill-switch, eval-runner root cause, needs-human-decision + environment-gated lists |
| `phases/README.md` (on `main`) | Phase 19 recorded in the completed-phases ledger |

## Public interfaces other phases can use
- `redactLogData(value)` from `@/platform/audit-log/redact` — redact PII for logging.
- `tokenMatches(token, expected)` from the inbound webhook route — constant-time compare (exported for its test).
- `buildCsp(nonce, isDev)` from `@/proxy` — the CSP string (exported for its test).
- The authz-coverage test's public allow-list is the canonical list of intentionally-public endpoints; add to it when a new public endpoint is justified.

## Decisions made
- **Branch base:** committed + merged Phase 19 to `main` first (owner-authorised), then branched `phase/20-hardening` off `main`, so the hardening pass covers Phase 19's code. Phase 19 merged with documented gaps (its e2e suite + eval-runner fix).
- **Scope:** did the static + vitest-runnable subset; everything needing Playwright/Lighthouse/axe/`next build`/`pnpm audit`/gitleaks/live-model evals is documented as environment-gated with exact commands (owner-confirmed approach).
- **CSP:** strict `script-src` via nonce (Next canonical pattern) + pragmatic `'unsafe-inline'` styles to avoid breaking React inline-style attributes that can't be runtime-verified here; flagged for a real-build check before launch.
- **Sweeper/eval-runner:** eval-runner crash diagnosed to root cause (tsx `--conditions=react-server` ignores `"use client"`, so a UI module importing `next/navigation` crashes the eval boot); the fix (make the manifest→UI edge lazy) is a focused follow-up, and the red-team suite can run under vitest instead.
- **Authz coverage:** implemented as a static self-authorization gate + explicit public allow-list (maintainable, fails CI on a new unguarded endpoint), with representative live 401/403 cases already covered by per-handler integration tests.

## Dependencies added
None.

## Change requests raised
None (Phase 20 owns "hardening fixes anywhere"; each change is recorded against a finding ID in `docs/hardening-report.md`).

## Known limitations (remaining Phase-20 work)
**Feasible follow-ups (vitest/docs; precise targets in the report):** the DSR/retention tests (INV-10), AI-quota + circuit-breaker tests, the `tests/chaos/` suite, and the `evals/_redteam/` suite (runnable under vitest); production AI budget defaults; the INV-7/13/18/19/24 gap tests; the `529` AI mock enum; the webhook tamper tests. (The kill-switch banner and `docs/cost-model.md` are now done.) **Environment-gated (CI/Phase 21):** `pnpm build`, `pnpm test:e2e` (+ Phase 19's still-to-be-authored e2e suite), Lighthouse/perf budgets + the 50k-lead DB pass, axe/dark-mode/screen-reader, `pnpm audit` + gitleaks, and the live-model red-team. **Not done:** the eval-runner edge fix (diagnosed, recommended).

## How to test it
- Security: `node --import tsx node_modules/vitest/vitest.mjs run src/proxy.test.ts src/platform/audit-log/log-redact.test.ts src/platform/http/ssrf.test.ts 'src/app/api/webhooks/inbound/[provider]/route.test.ts' tests/integration/authz-coverage.test.ts --no-file-parallelism` (PG up via `node scripts/db.mjs up`).
- Full gate (CI): `pnpm check` + `pnpm test:e2e` on a clean DB (`! pnpm db:reset` first) — plus the environment-gated commands in `docs/hardening-report.md` §7.
