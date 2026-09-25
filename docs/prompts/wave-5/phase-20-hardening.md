# Phase 20: Hardening

> **How to run this phase**
> 1. Phase 19 must be merged.
> 2. Put this file in `docs/prompts/`. Run `git checkout -b phase/20-hardening`.
> 3. Open Claude Code. Use Opus at maximum effort and switch to plan mode.
> 4. Say: **"Read docs/prompts/phase-20-hardening.md and execute it. Plan first."**
>
> Wave 5, sequential. Depends on Phase 19. Phase 21 depends on it.

---

## Your role and the goal of this phase

The platform works. Now make it **safe, lawful, fast, accessible, affordable and resilient** before real prospects, real money and real mailboxes are involved. You're the senior reviewer and the attacker at the same time. Every earlier phase ran `saas-review` on its own diff. **You review the whole system at once,** and prove each property with tests, not assertions.

**Output:**

- every Critical and Major issue fixed
- a **hardening report** (`docs/hardening-report.md`) with evidence
- a **compliance traceability matrix** that maps every project-rules invariant to the code that enforces it and the tests that prove it

You may fix issues in any area (Phase 20 owns "hardening fixes anywhere"). Record every change against a finding ID.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (every invariant and ban), `docs/decisions.md` and `docs/architecture.md`
2. `docs/specs/*`, `docs/contracts/*` and `docs/schedules.md`
3. Every `phases/*/SUMMARY.md`, especially the "known limitations" sections
4. **The global skills `saas-review` in full (including `references/security.md`, `typescript.md` and `severity-guide.md`), `saas-testing`, `saas-auth` (auth security), `saas-api`, `saas-ai` (safety and cost), `saas-ui` (the finish checklist, accessibility), `saas-ship` (performance budgets, security headers) and `dataviz` (chart accessibility)**

Use Context7 or the web for current guidance where needed: the OWASP ASVS/Top 10 checklist items relevant to Next.js, the Next.js security headers and CSP with nonces, and the current Gmail/Yahoo sender requirements. Cite the sources in the report.

---

## Step 1: Security audit (full repository, not a diff)

Work through `saas-review/references/security.md` across the whole codebase. At minimum:

1. **Authorisation coverage, proven by an automated test:**
   - Write a script that enumerates **every** server action and route handler (scan the `"use server"` exports and `src/app/**/route.ts`).
   - Generate tests asserting that each one rejects unauthenticated calls and calls from a role without permission.
   - Explicitly allow-list the public ones (auth, health, cron with a secret, webhooks with signatures, unsubscribe with signed tokens). Any new unlisted endpoint fails CI.
2. **IDOR:** for every resource-by-ID action (lead, message, reply, proposal, meeting, credential, profile, saved search, file), test that a user from another service line or without ownership gets 403 or 404. Test that IDs from the request body are never trusted for scoping.
3. **Webhooks and cron:**
   - signature verification on the raw body
   - replay protection (dedupe)
   - timestamp tolerance where the provider supports it
   - cron secret checks
   - tests with tampered payloads
4. **Injection:**
   - no string-built SQL (only tagged templates)
   - no command execution
   - untrusted content never reaches `dangerouslySetInnerHTML`
   - AI output and scraped content are rendered as text or through a sanitiser
   - email bodies are built safely (header injection through subjects or names is prevented)
5. **SSRF:** the safe fetcher and browser runtime tests cover redirects to private IPs, DNS rebinding, IPv6 and metadata endpoints. No other code path fetches arbitrary URLs; grep for `fetch(` and HTTP clients to confirm.
6. **CSRF:** server actions and mutations are protected (Next.js origin checks plus the saas-auth rules).
7. **Sessions and authentication:**
   - cookie flags
   - rotation on privilege change
   - rate limits on all auth endpoints
   - 2FA enforced for admins
   - non-enumerating messages
   - password policy
8. **Secrets:**
   - run a secrets scanner (for example gitleaks) over the full history
   - no secrets in client bundles (inspect the build output for `NEXT_PUBLIC_` misuse and inlined keys)
   - credentials encrypted at rest, with a test that reads the raw database column and finds no plaintext
   - the encryption key is never logged
9. **PII in logs:** grep the logging calls, and add a log redaction layer if one is missing. No emails, phones, message bodies or tokens in logs or error reports.
10. **Security headers and CSP:**
    - strict CSP with nonces where needed
    - HSTS
    - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
    - `frame-ancestors 'none'`
    - `noindex` everywhere
    - configured in middleware or `next.config`, and tested
11. **Dependencies:**
    - `pnpm audit`, with every high or critical issue fixed or justified
    - a licence check (no licences incompatible with internal commercial use)
    - remove unused packages
12. **Prompt-injection red team:**
    - Build `evals/_redteam/` with at least 30 adversarial inputs injected at every untrusted entry point: website text, reviews, job posts, social metadata, reply emails, CSV fields, meeting transcripts and saved-search names.
    - Run them across every AI task.
    - Assert that there are no instruction-following leaks, no invented facts, no tool or privilege escalation, no prompt disclosure, and that the number and citation validators still hold.
    - Record the results.

---

## Step 2: Compliance check

1. **Traceability matrix,** in `docs/hardening-report.md`: for **every** domain invariant in project-rules, the enforcing code (file and function), the database constraint if any, the tests that prove it, and its status. Any invariant without a test gets one now.
2. **Targeted tests** for the riskiest paths:
   - **Suppression race:** a contact suppressed *after* approval but *before* sending must never be sent to. Test it with concurrent operations.
   - **Double send:** retrying a send job, duplicate ticks, and a workflow resumed mid-step never send the same message twice. Use the idempotency key and provider message ID checks.
   - **Unsubscribe:** one-click without a session, idempotent; a company-wide stop; no marketing reply.
   - **The footer and unsubscribe headers** are present on every outbound email type (sequence, one-off, proposal).
   - **The UK PECR rule** under unknown and changing legal form.
   - **WhatsApp and LinkedIn** can never be sent automatically: scan for any API client that could.
   - **DSR export completeness, and delete anonymisation,** including the hashed re-suppression.
   - **The retention purge** removes exactly the right data.
   - **Evidence citation:** no approved message has an uncited claim, including edited-and-confirmed ones.
3. **A global outreach kill switch.** Add `acquisition.outreach.globalPause` (an `ADMIN` setting, audited):
   - when on, no email sends and no assisted links are generated
   - drafts can still be reviewed
   - the UI shows a clear platform-wide banner
   - it's tested
   - document it in the runbook section of the report, for Phase 21
4. **Country rules:** confirm the table defaults unknown countries to `REVIEW`. Flag clearly in the report that **the table and the NDPA/PECR/GDPR handling need review by a qualified person before launch.** You aren't giving legal advice.

---

## Step 3: Performance

1. **Web performance:**
   - Run Lighthouse (or an equivalent, in CI) on the key screens: home, search, review, lead detail, pipeline, inbox, analytics, profile editor.
   - Budgets:
     - LCP < 2.5s
     - CLS < 0.1
     - INP < 200ms, on a mid-range mobile profile
     - a JavaScript budget per route, set after measuring
   - Fix regressions: code-split heavy components (charts, editor, Kanban), lazy-load galleries, optimise images and fonts, and remove client components that should be server components.
2. **Bundle analysis:** report the largest modules per route and act on them.
3. **Database:**
   - Log slow queries with the staging dataset plus the 50,000-lead generator.
   - Run `EXPLAIN ANALYZE` on the top 20.
   - Add missing indexes through a migration.
   - Remove N+1 queries (enable Prisma query logging in tests and assert query counts on the heavy pages).
4. **Serverless fit:**
   - check every Workflow step and function against the current Vercel duration limits
   - split any step at risk
   - check cold-start impact on the key routes
   - add connection pooling (Neon pooled URL) if it's not already in place
5. **Caching:** confirm the tag invalidation works (for example approving a message updates the badges and analytics after revalidation), with no stale permission-sensitive data served across users.

---

## Step 4: Accessibility and dark mode polish

- **axe** on every route, in both themes, for each role: zero serious or critical violations.
- **Manual keyboard walkthrough** of the eight end-to-end journeys: logical focus order, visible focus, no traps, every shortcut discoverable in the "?" overlay, dialogs return focus.
- **Screen reader spot checks** (NVDA or VoiceOver logic, verified through the accessibility tree) on the review queue, Kanban drag announcements, the inbox thread, charts (their data-table fallback) and forms with errors.
- **Dark mode:** capture every screen in dark mode with Playwright MCP. Fix contrast failures, invisible borders or shadows, chart colours (run the dataviz validator for dark), images and logos (the right variant), and states like hover, selected and disabled. Look at each screen; don't just run tools.
- **Reduced motion:** all motion respects it, with no essential information conveyed only by animation.

---

## Step 5: AI cost caps and a cost model

1. Verify end to end that each of these works in the real code path:
   - **Budgets:** platform daily and monthly, per module, per user, per task maximum tokens.
   - **Blocking:** calls are blocked at the limit with a clear UI message.
   - **Warnings:** at 80%, a notification.
   - **Per-lead caps:** sourcing, enrichment and audit caps stop work gracefully.
2. **Set production defaults** in the seed or bootstrap settings, conservative for launch. Write them in the report.
3. **Cost model:** write `docs/cost-model.md`.
   - Using the per-call costs measured in earlier phases (audits per line, AI calls per lead, provider calls), estimate the cost per lead reaching review, per line and market.
   - Then estimate the monthly cost at three volumes (for example 200, 1,000 and 5,000 leads a month), including Vercel, Neon, the providers, Anthropic and the mailboxes.
   - Show the assumptions and mark anything estimated.
4. **Use prompt caching and model tiers wisely:** confirm the cacheable system prompts are cached, and downgrade tasks to cheaper tiers where the evals show no loss. Record the before and after cost per lead.

---

## Step 6: Failure and retry behaviour

Build a **chaos suite** (`tests/chaos/`) using the mock failure modes and fault injection:

- **Anthropic:** 429, 529/overload, timeout, invalid output twice. Expect retries, the circuit breaker opening, graceful `AI_*` errors, leads staying where they are and resuming later, and the UI explaining it.
- **PageSpeed, YouTube, Places, SerpAPI or Hunter down:** partial audits and runs, with "not assessed" recorded and retry later.
- **Email sender failure mid-batch:** no double sends, the message goes back to scheduled, the mailbox health updates.
- **Inbound source down:** the poll cursor is kept, no replies are lost, and they catch up on recovery.
- **Database transient error inside a transaction:** a full rollback, with no half-written lead transitions or orphan events.
- **A workflow killed mid-step:** it resumes from the failed step, and the idempotency holds.
- **Cron tick delivered twice:** the jobs run once.
- **Dead letters:** jobs that exhaust their retries are visible in `/admin/jobs` with the error, alert admins, and can be retried.

Every scenario gets an automated test and a line in the report.

---

## Step 7: Final full review

Run `saas-review` over the **entire** repository, not a diff. Output in its CodeRabbit style: a walkthrough, findings by severity, verification and a verdict. Fix every Critical and Major finding. List the Minor findings and Nits, and fix the cheap ones.

---

## Constraints

- **Don't change product behaviour** beyond what's needed to fix a finding, plus the kill switch.
- **Every fix has a test.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The security audit is complete: an automated authorisation coverage test over every endpoint, IDOR tests, webhooks, injection, SSRF, CSRF, sessions, secrets scan, PII log redaction, headers and CSP, dependencies, and the red-team suite results.
- [ ] The compliance traceability matrix covers every invariant with passing tests. The race, double-send, unsubscribe, footer, PECR, assisted-only, DSR, retention and citation tests pass. The global kill switch is built.
- [ ] Performance budgets are met on the key screens, database hot spots are fixed, and the serverless limits are checked.
- [ ] axe is clean everywhere in both themes, the keyboard and screen-reader checks are done, and dark mode is polished and reviewed visually.
- [ ] AI caps are verified, production defaults are set, `docs/cost-model.md` is written, and caching and tiers are optimised.
- [ ] The chaos suite passes.
- [ ] A full-repository `saas-review` shows zero Critical or Major findings.
- [ ] `docs/hardening-report.md` is written, including a **"Needs a human decision before launch"** list (legal review, pricing confirmation, placeholder portfolio items, budgets).
- [ ] `pnpm check`, `pnpm test:e2e` and the chaos suite pass.
- [ ] `phases/20/SUMMARY.md` is written.
