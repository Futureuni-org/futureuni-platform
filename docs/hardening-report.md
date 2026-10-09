# Hardening report (Phase 20)

The pre-launch security, compliance, performance, accessibility, cost and resilience review of the whole FUTUREUNI platform. Every finding has an ID; fixes are recorded against it. This report is honest about what was verified in this environment and what must be run in a capable CI/dev environment (Playwright, Lighthouse, axe-in-browser, full `next build`, `pnpm audit`, gitleaks) before launch.

**Status summary.** Security hardening (SEC-1…5) is done and tested. The compliance traceability matrix is complete; the global kill-switch enforcement is in place (a UI banner is the one remaining piece). The performance, accessibility, dependency-scan and live-eval steps are environment-gated and listed with exact commands. A **"Needs a human decision before launch"** list closes the report.

Verification in this environment: `tsc --noEmit` 0 errors; `eslint .` clean; targeted `vitest` green (the new SEC tests + the existing suites on a clean test DB). `pnpm build` and `pnpm test:e2e` were not run here (see §Environment-gated).

---

## 1. Security findings

| ID | Area | Finding | Fix | Test |
|---|---|---|---|---|
| **SEC-1** | AuthZ coverage | No test proved every endpoint rejects unauth/wrong-role; the surface could grow unguarded. | Added an enumerating coverage gate: every `src/app/**/route.ts` + every `"use server"` file must self-authorize or be on the explicit public allow-list; a new unlisted/unguarded endpoint fails CI. The scan confirmed **all** current non-public endpoints already authorize. | `tests/integration/authz-coverage.test.ts` (3) |
| **SEC-2** | Headers / CSP | **No security headers at all** (confirmed: no CSP/HSTS/nosniff/referrer/permissions/frame-ancestors). | Added, in `src/proxy.ts` on every response: a nonce-based CSP (strict `script-src 'self' 'nonce' 'strict-dynamic'` per the Next canonical guide; `style-src 'unsafe-inline'` so React inline-style attributes don't break), `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera/mic/geo/payment off), `X-Robots-Tag: noindex`. | `src/proxy.test.ts` (4) |
| **SEC-3** | Webhooks | Inbound (Gmail Pub/Sub) webhook compared its shared token with `!==` (non-constant-time). | Switched to a hash-based `timingSafeEqual` (`tokenMatches`). Outbound + calendar already use `timingSafeEqual` + dedupe. | `src/app/api/webhooks/inbound/[provider]/route.test.ts` (2) |
| **SEC-4** | SSRF | The fetcher blocks private/metadata/IPv6/redirects; coverage missed IPv6-metadata / IPv4-mapped literals. | The guard runs on every redirect hop (so DNS-rebinding redirects are re-checked); added IPv6-metadata (`fd00:ec2::254`) and IPv4-mapped (`::ffff:169.254.169.254`) cases. | `src/platform/http/ssrf.test.ts` (7) |
| **SEC-5** | PII in logs | The structured job logger serialized `data` verbatim — no redaction (convention only). | Added `redactLogData` (drops PII keys: email/phone/body/subject/transcript/name/address; masks emails + E.164 phones inside string values; no false positives on IDs or money minor units) and routed `makeLogger` through it. | `src/platform/audit-log/log-redact.test.ts` (5) |

| **SEC-6** | Webhooks | **Both public webhook receivers accepted unauthenticated requests in production.** `/api/webhooks/inbound/*` and `/api/webhooks/outbound/*` treated "no secret configured" as "accept" whenever `MOCKS=true` — and the production deployment runs `MOCKS=true` with an empty credentials vault. Verified against the live site on 2026-10-09: the outbound route reached payload validation (`422`) with no signature, and the inbound route returned `200 {"ok":true}` with no bearer token. A forged outbound payload would write `TrackingEvent` rows and could record bounces and unsubscribes, which suppress contacts and stop enrolments (INV-3). SEC-3 hardened the token *comparison* on this route but not the case where no secret exists. The calendar receiver was unaffected: `verifyCalComSignature` returns `false` without a secret, so it already failed closed. | Skipping verification is now a local-development convenience only: the no-secret branch also requires `env.VERCEL !== "1"`, so any deployment answers `401`. The secret is resolved through the new `resolveWebhookSecret`, which deliberately ignores mock mode, because mock mode must never downgrade authentication on a publicly reachable endpoint. | `tests/integration/authz-coverage.test.ts` ("no public webhook route accepts unverified calls on a deployment"; confirmed to fail against the pre-fix source) |
| **SEC-7** | Mock mode / secrets | `resolveProviderKey` read the credentials vault *before* any mock guard, so a key saved through `/admin/integrations` was returned even while that provider was mocked, letting an adapter call the real service from mock mode. Only the env-variable fallback was guarded. `src/platform/ai/settings-adapter.ts` re-read `ANTHROPIC_API_KEY` directly, bypassing the guard a second time. | `resolveProviderKey` now returns `null` unless `isProviderLive(id)`, covering vault and env alike; the AI adapter's duplicate env read was removed. `testCredential` reads `getCredential` directly, so an admin can still test a stored key while the provider is mocked. | `src/platform/credentials/service.test.ts` ("withholds a vaulted key while the provider is mocked…"), `src/platform/credentials/providers.test.ts` (6) |

**Secrets / credentials (verified, no fix needed):** AES-256-GCM at rest with a plaintext-free DB test (`credentials/service.test.ts`, `crypto.test.ts`); only `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SENTRY_DSN` are public (neither a secret); `src/env.ts` throws if a server var is read client-side.

**CSP note (needs runtime verification — see §Environment-gated):** the nonce→render interaction and any inline-style breakage must be checked against a real `next build` across every route and role; the CSP is in `src/proxy.ts` and easily tuned (e.g. widen a directive or move to Report-Only) if a violation appears.

**Remaining feasible security tests** (not blocking; precise locations): tamper-payload tests for the outbound + calendar webhook receivers; a safe-fetch redirect→private-IP integration test (needs an undici/MSW redirect mock).

## 2. Compliance traceability matrix (INV-1…25)

Enforcing code · DB constraint · test · status. `✓` enforced + tested; `✓ (gap)` enforced but the test is thin/missing (listed under §2b).

| INV | Enforcing code | DB constraint | Test | Status |
|---|---|---|---|---|
| 1 LeadEvent per status change | `core/lead-state.ts` `transitionLead()` | append table | `core/lead-state.test.ts` | ✓ |
| 2 Suppression on send/assisted | `outreach/email/send.ts`; `assisted/assisted.ts`; `enrichment/pipeline.ts` | `acq_suppressions_live_key` | `outreach.integration`, `inbox.integration`, `core/suppression.test.ts` | ✓ |
| 3 Reply/bounce/unsub stops company enrolments | `outreach/sequences/stop` `stopEnrollments` | `acq_enrollments_one_open_thread` | `inbox.integration.test.ts` | ✓ |
| 4 One-click unsub + footer + postal | `outreach/email/send.ts`, `email/mime.ts` | — | `outreach.integration`, `email/mime.test.ts` | ✓ |
| 5 AI claims cite finding/signal | `ai/run-task.ts` `enforceCitations`, `ai/citations.ts`; send-path strip | `acq_message_citations_*_key` | `ai/citations.test.ts`, `outreach/draft/validators.test.ts` | ✓ |
| 6 UK PECR | `compliance/country-rules.ts`, `contactability.ts` | — | `compliance/contactability.test.ts`, `country-rules.test.ts` | ✓ |
| 7 Assisted-only (no auto WA/LinkedIn) | `outreach/assisted/assisted.ts` (no WA/LI API exists) | — | `assisted/links.test.ts` | ✓ (gap: no negative "no-API-exists" scan test) |
| 8 Send window + caps + warm-up | `outreach/email/send-window.ts`, `mailboxes/rotation.ts` | `@@unique([mailboxId, day])` | `send-window.test.ts`, `warmup.test.ts` | ✓ |
| 9 One active thread per company | DB index + `createDraft` cross-sell hold | `acq_enrollments_one_open_thread`, `acq_cross_sell_groups_one_active_key`, `acq_leads_one_open` | `outreach.integration.test.ts` | ✓ |
| 10 Source/collectedAt/basis; DSR; retention anonymise | `compliance/dsr.ts`, `compliance/retention.ts` | soft-delete `deletedAt` | — | ✓ (gap: **DSR + retention untested**) |
| 11 Money minor units per currency; costMicros | `lib/money.ts`, `ai/pricing.ts` | — | `ai/pricing.test.ts`, `proposals/pricing.test.ts` | ✓ |
| 12 UTC + viewer tz + injectable now | injected `Clock` | — | implicit (`send-window.test.ts`) | ✓ (gap: no dedicated test) |
| 13 AiCall per call | `ai/run-task.ts` `writeAiCallRow` | — | `ai/pii.test.ts` | ✓ (gap: no direct runTask→AiCall-row test) |
| 14 Source terms/robots | `sourcing/adapters/registry.ts`, `_shared/provider-http.ts` | — | `provider-http.test.ts` | ✓ |
| 15 Transitions via transitionLead | `core/lead-state.ts` | — | `core/lead-state.test.ts` | ✓ |
| 16 One active profile version | `profiles/write.ts`, `validate.ts` | `acq_profile_versions_one_active_key`, `…one_draft_key` | `profiles/validate.test.ts` | ✓ |
| 17 Deterministic pricing | `pipeline/proposals/pricing.ts`, `number-check.ts` | — | `proposals/pricing.test.ts`, `number-check.test.ts` | ✓ |
| 18 Findings have evidence; dismissed can't be cited | `audits/**`, `outreach/email/send.ts` step 4 | `AuditFinding @@index([dismissedAt])` | `ai/citations.test.ts` + integration | ✓ (gap: no direct dismissed-blocks-approval test) |
| 19 No placeholder portfolio to prospects | `profiles/resolve.ts` `resolvePortfolio` | — | — | ✓ (gap: no explicit exclusion test) |
| 20 Append-only audit | `platform/audit-log/service.ts`, `redact.ts` | — | `audit-log/service.test.ts`, `redact.test.ts` | ✓ |
| 21 Credentials ciphertext only | `platform/credentials/crypto.ts`, `service.ts` | — | `crypto.test.ts`, `service.test.ts` | ✓ |
| 22 Idempotent jobs/sends | `platform/jobs` JobRun key; `outreach/email/send.ts` providerMessageId | `acq_replies_mailbox_message_key`, JobRun idempotency key | `jobs/enqueue.test.ts`, `dispatcher.test.ts`, integration | ✓ |
| 23 Unsubscribe before any send; never answered | `send.ts` suppression gate; inbox unsubscribe | suppression index | `inbox.integration`, `outreach.integration` | ✓ |
| 24 Untrusted data delimited | `ai/skills/delimiter.ts` `wrapUntrusted`, `ai/run-task.ts` | — | eval injection cases | ✓ (gap: no delimiter unit test) |
| 25 Contactability ALLOWED | `compliance/contactability.ts`, `country-rules.ts` | — | `compliance/contactability.test.ts` | ✓ |

### 2b. Remaining feasible compliance tests (vitest; precise targets)
- **INV-10** DSR export completeness + delete-anonymisation (incl. hashed re-suppression): `compliance/dsr.ts` — untested. Retention purge removes exactly the right rows: `compliance/retention.ts` — untested.
- **INV-7** negative scan: no WhatsApp/LinkedIn send API exists (a grep-assertion test).
- **INV-24** `ai/skills/delimiter.ts` escaping unit test.
- **INV-13** `runTask` writes an `AiCall` row (all outcomes).
- **INV-18/19** dismissed-finding-blocks-approval; placeholder-portfolio exclusion.
- Step-2 targeted: suppression-after-approval race, double-send (retry/dup-tick/resumed-workflow), one-click unsubscribe (no session, idempotent, company-wide, no reply), footer+headers on every email type, PECR under changing legal form.

### 2c. Global kill switch (COMP-3)
`acquisition.outreach.globalPause` (MODULE boolean, `requiredPermission: acquisition.outreach.globalPause`) is **enforced**: `outreach/email/send.ts` reschedules with `OUTREACH_PAUSED` and `assisted/assisted.ts` `assertAssistedAllowed()` blocks all assisted-link generation (WhatsApp/LinkedIn/call). **Done:** a platform-wide UI banner (`src/components/shell/outreach-paused-banner.tsx`, wired into `ShellLayout`, tested) shows on every signed-in page when it's on. **Runbook (for Phase 21):** an ADMIN sets `acquisition.outreach.globalPause = true` in `/admin/platform`; until the launch-checklist gates are green it stays `true` in production (project-rules §Launch gates).

### 2d. Country rules (COMP-4)
Unknown countries default to `REVIEW` (`compliance/country-rules.ts`). **Needs a qualified person to review the NDPA/PECR/GDPR handling and the country-rules table before any real cold email** — see §Needs a human decision.

## 3. AI cost caps (Step 5)
Enforcement exists (`ai/quota.ts` `checkQuotasBeforeCall` → `AI_QUOTA_EXCEEDED` at platform daily/monthly, per-module, per-user; `ai.budget.warning` at 80%; `ai/providers/circuit-breaker.ts`; per-lead sourcing cap in `sourcing/budget.ts`). **Gaps:** `quota.ts` and the circuit breaker are untested; the `ai.budget.*` event is a console stub pending the Phase-6 publisher (wire to `events.publish`). **Done:** `docs/cost-model.md` (per-lead ≈ $0.13 to review, monthly at 200/1,000/5,000 leads, with marked assumptions + the controls that bound cost). **Remaining feasible:** quota + circuit-breaker vitest tests; set conservative production budget defaults in the bootstrap settings (the cost model proposes values).

## 4. Resilience / chaos (Step 6)
Mocks support fault injection: AI `AI_MOCK_FAIL` (`timeout`/`429`/`invalid`/`empty`) and the email sender's `configureMockSender({ failFor })` (can fail mid-batch, dedupes by messageId). **Gap:** the AI mock can't emit `529/overloaded` (not in the `AI_MOCK_FAIL` enum, though `providers/retry.ts` classifies it as retryable) — extend the enum. Jobs have no distinct dead-letter state (retries-exhausted shows as `FAILED` in `/admin/jobs` with a Retry action). **Done:** `tests/chaos/ai-resilience.test.ts` covers the circuit breaker (opens after 5, half-open probe, reset) and the retry helper (429/5xx/`overloaded_error` incl. 529-class retried then succeed/exhaust; non-retryable fails fast). `tests/chaos/cron-idempotency.test.ts` covers the double cron-tick case (the 5-minute slot key collapses duplicate ticks to one JobRun). **Remaining feasible:** email mid-batch no-double-send, DB-rollback-in-transaction, workflow-resume (these read committed DB, so they need a seed-and-clean integration pattern).

## 5. Red-team (Step 1.12) — RT-1
**Eval-runner crash — FIXED (post-review).** Root cause: `pnpm evals` runs `tsx --conditions=react-server evals/_runner/cli.ts`, which boots `@/platform/ai` → the module registry → the acquisition manifest. Under `--conditions=react-server` tsx ignores `"use client"` boundaries and follows all static imports; nearly every manifest-reachable service imports `@/platform/auth`, whose `session.ts` statically imported `redirect` from `next/navigation`, whose **client** build calls `React.createContext` and throws on the server build. Fix: `session.ts` now **lazy-imports `redirect`** inside `requireUser`, so `@/platform/auth` no longer statically pulls the client navigation module. `pnpm evals` now boots and runs all cases (158 passing on the mock baseline). A real `next build` was always unaffected. **Red-team suite (remaining):** author `evals/_redteam/` (≥30 adversarial inputs at every untrusted entry point) and run it under **vitest** (no `react-server` condition, so no crash) asserting the deterministic defences hold — the untrusted-data delimiter (INV-24), the number-consistency and citation validators (INV-5/INV-17), and `stripCitationMarkers`. Live-model instruction-following resistance needs real Anthropic calls (see §Environment-gated).

## 6. Needs a human decision before launch
- **Legal:** a qualified person must review the country-rules table and the NDPA (Nigeria) / PECR (UK) / GDPR handling before any real cold email. This report gives no legal advice.
- **Pricing:** confirm the service-line pricing in the profiles is real, not placeholder.
- **Placeholder portfolio:** confirm no `isPlaceholder` portfolio items reach prospects (INV-19 enforces exclusion; confirm the data).
- **AI budgets:** confirm the conservative production budget defaults.
- **Kill switch:** `acquisition.outreach.globalPause` stays `true` in production until the launch checklist is green.
- **CSP:** verify the nonce CSP against a real build across every route/role before relying on it (§1).

## 7. Environment-gated — not run here (exact commands for CI/Phase 21)
These need a capable environment (full build + browser + network + package installs); this sandbox cannot run them reliably.
- **Build:** `pnpm build`; **e2e:** `pnpm test:e2e` (and the `@smoke` subset) — note Phase 19's e2e suite is still to be authored.
- **Performance (Step 3):** Lighthouse on home/search/review/lead-detail/pipeline/inbox/analytics/profile-editor (budgets LCP<2.5s, CLS<0.1, INP<200ms); bundle analysis; the 50,000-lead DB generator + `EXPLAIN ANALYZE` on the top 20 queries + missing-index migration; Workflow step duration vs Vercel limits; Neon pooled URL.
- **Accessibility (Step 4):** `axe` on every route in both themes for each role (zero serious/critical); keyboard + screen-reader walkthrough of the 8 journeys; dark-mode capture via Playwright; reduced-motion.
- **Dependencies (Step 1.11):** `pnpm audit` (fix/justify high+critical); licence check; remove unused packages.
- **Secrets (Step 1.8):** `gitleaks detect` over the full history; inspect the build output for `NEXT_PUBLIC_` misuse.
- **Live evals / red-team (Step 1.12):** run the red-team across every AI task against the real model once the eval-runner edge is fixed.

## 8. Verdict
Security hardening (SEC-1…5) and the compliance traceability matrix are **done and verified** in this environment, with no open Critical or Major findings in the reviewed-and-tested scope. The remaining compliance/AI/chaos tests, the kill-switch banner, the cost model, and the red-team suite are **feasible follow-ups** (precise targets above); the performance, accessibility, dependency-scan, and live-eval steps are **environment-gated** and must run in CI/Phase 21 before go-live.
