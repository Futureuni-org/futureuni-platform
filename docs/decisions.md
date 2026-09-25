# Decisions log (ADRs)

Every decision that shapes the build, with its reason. ADR-001 to ADR-012 are fixed by the project brief and must not be changed without the owner's approval. The later ADRs were decided in Phase 0, researched where marked, with sources cited. Phases propose new ADRs in their `SUMMARY.md` and `REQUESTS.md`; they're added here when the wave is merged.

**Format:** each ADR has Status, Decision and Reason, plus Context, Options and Consequences where they matter. Sources are cited inline. Anything unverified is marked **verify**.

| ADR | Title | Status |
|---|---|---|
| ADR-001 | Stack | Accepted (fixed) |
| ADR-002 | Architecture: modular monolith | Accepted (fixed) |
| ADR-003 | Hosting: Vercel Pro with Neon, Blob, Workflow and Cron | Accepted (fixed) |
| ADR-004 | Local development | Accepted (fixed) |
| ADR-005 | Mock-first integrations | Accepted (fixed) |
| ADR-006 | Claude only through the platform AI service | Accepted (fixed) |
| ADR-007 | Runtime AI behaviour in runtime skill files | Accepted (fixed) |
| ADR-008 | Service lines | Accepted (fixed) |
| ADR-009 | Markets | Accepted (fixed) |
| ADR-010 | Channels | Accepted (fixed) |
| ADR-011 | Theme: light default, dark first-class | Accepted (fixed) |
| ADR-012 | Parallel build protocol | Accepted (fixed) |
| ADR-013 | Auth library | Accepted (researched) |
| ADR-014 | Font pairing | Accepted |
| ADR-015 | Personal-data retention period | Accepted |
| ADR-016 | Cold-outreach sending and reply ingestion | Accepted (researched) |
| ADR-017 | Headless browser runtime on Vercel | Accepted (researched) |
| ADR-018 | AI model tiers and configuration | Accepted |
| ADR-019 | Database connectivity (Neon + Prisma) | Accepted |
| ADR-020 | Email finder and verifier | Accepted (researched) |
| ADR-021 | Calendar and booking provider | Accepted (researched) |
| ADR-022 | Proposal and handoff PDF rendering | Accepted (researched) |
| ADR-023 | Platform (transactional) email | Accepted |
| ADR-024 | Package manager and Node.js version | Accepted |
| ADR-025 | Execution in batches and the seam rule | Accepted |
| ADR-026 | Complete ownership map from day one | Accepted |
| ADR-027 | Internal cost unit: integer micro-USD | Accepted |
| ADR-028 | AI service entry point is `runTask` | Accepted |
| ADR-029 | Module milestones map to build phases | Accepted |
| ADR-030 | Monitoring: Sentry | Accepted |
| ADR-031 | No open tracking or link rewriting by default | Accepted |
| ADR-032 | Invariant 9 covers ACTIVE and PAUSED enrolments | Accepted |
| ADR-033 | Vercel project config stays in `vercel.json` | Accepted |
| ADR-034 | Compliance posture pending legal review (Nigeria GAID, EU consent countries) | Accepted |

---

## Fixed decisions (from the brief)

### ADR-001: Stack
- **Status:** Accepted (fixed), 2026-09-25.
- **Decision:**
  - Next.js App Router with the `src/` directory, TypeScript strict, Tailwind CSS.
  - Prisma ORM on PostgreSQL. Zod for all validation.
  - React Hook Form for forms, Motion (`motion`, imported from `motion/react`) for animation, Lucide icons.
  - Three.js only if a 3D moment is ever justified (saas-ui rules).
- **Reason:** the team is strongest in JavaScript/TypeScript, and this stack is the saas-* skills' default, so every skill applies without translation.

### ADR-002: Architecture: modular monolith
- **Status:** Accepted (fixed).
- **Decision:**
  - One Next.js application, one database, one login, one deployment.
  - Each internal tool is a module under `src/modules/<module-id>/` that registers itself through a manifest (`docs/contracts/module-manifest.md`). Client Acquisition is `src/modules/acquisition/`.
  - Future modules (for example Marketing, the "Content Engine") are added without touching the platform core.
- **Reason:** one team, one host and one bill. Shared auth, directory and services come for free, and module boundaries (enforced by lint) keep future tools independent.

### ADR-003: Hosting: Vercel Pro with Neon, Blob, Workflow and Cron
- **Status:** Accepted (fixed).
- **Decision:**
  - Vercel Pro.
  - Neon Postgres through the Vercel Marketplace.
  - Vercel Blob for files.
  - Vercel Workflow for multi-step and long-running background work.
  - Vercel Cron for schedules.
  - No separate servers or hosts.
- **Reason:** one dashboard and one bill. The Hobby plan is for non-commercial use only. Workflow resumes from the last completed step, which suits the source → enrich → audit → score pipeline.
- **Platform facts that constrain the design** (verified 2026-09-25):
  - **Vercel Workflow:**
    - It's the `workflow` package, GA since 2026-04-16 (4.x stable; 5.0 in beta). It's wired with `withWorkflow` from `workflow/next`, with `"use workflow"` and `"use step"` directives, runs started with `start()` from `workflow/api`, and `FatalError`/`RetryableError`.
    - Steps retry 3 times by default. **`start()` has no idempotency key**, so deduplication lives in our `JobRun.idempotencyKey` (INV-22).
    - On Pro a step runs at most 800 s. Run data is kept 7 days. The local world stores runs in `.workflow-data/`.
    - `.well-known/workflow/` must be excluded from the `src/proxy.ts` matcher.
  - **Vercel Cron:** Pro allows 100 cron jobs, a minimum interval of one minute, and **UTC schedules only**. It sends `Authorization: Bearer <CRON_SECRET>`. Delivery is best effort (runs can be missed or duplicated, and failed runs aren't retried), so the tick handler must be idempotent and reconcile due work.
  - **Vercel Blob:** private stores are GA (`@vercel/blob` ≥ 2.3). The access mode is fixed at store creation. OIDC auth is the default, and signed URLs and presigned uploads are available. Function bodies are limited to 4.5 MB, so uploads go direct to Blob.
  - **Vercel Functions:** Fluid Compute on Node.js 24. Default timeout 300 s, and bundles up to 5 GB (which matters for ADR-017). The Edge runtime is deprecated; don't use it.
  - Sources: https://vercel.com/docs/workflows, https://vercel.com/docs/workflows/pricing, https://workflow-sdk.dev/docs/foundations/errors-and-retries, https://vercel.com/docs/cron-jobs, https://vercel.com/docs/vercel-blob/private-storage, https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size

### ADR-004: Local development
- **Status:** Accepted (fixed).
- **Decision:** Docker Compose Postgres (or a Neon development branch), with `.env.local` validated by the Zod env schema in `src/env.ts`.
- **Reason:** fast, offline-capable development and tests. Parallel worktrees each get their own database (`futureuni_p<nn>`).

### ADR-005: Mock-first integrations
- **Status:** Accepted (fixed).
- **Decision:** every external service is reached through an adapter interface with at least two implementations, `mock` (realistic fake data, no network) and the real provider. The implementation is chosen by env (`MOCKS`) or settings. The whole platform must be buildable, testable and usable end to end with mocks only. Real keys are switched on in Phase 21, one provider at a time.
- **Reason:** parallel phases can build and test without accounts or spend, tests never touch the network, and go-live becomes a configuration change.

### ADR-006: Claude only through the platform AI service
- **Status:** Accepted (fixed).
- **Decision:** the Claude API is reached only through `src/platform/ai/`. No module imports the Anthropic SDK (lint enforces this). Model names live in configuration, never in code (ADR-018).
- **Reason:** one place for logging, cost, quotas, prompt versions, safety and mocks (INV-13).

### ADR-007: Runtime AI behaviour in runtime skill files
- **Status:** Accepted (fixed).
- **Decision:** runtime AI behaviour lives in `runtime-skills/<module>/<task>/SKILL.md` (plus references and examples), loaded by the AI service. `runtime-skills/_shared/` holds cross-task skills such as `futureuni-voice`. `CLAUDE.md` is for building only, never for runtime behaviour.
- **Reason:** prompts become versioned, reviewable and eval-gated files, separate from the instructions that build the code.

### ADR-008: Service lines
- **Status:** Accepted (fixed).
- **Decision:** the `ServiceLine` enum is `WEB_DEVELOPMENT`, `UI_UX_DESIGN`, `GRAPHIC_DESIGN`, `VIDEO_EDITING`. A new line is added by adding a profile (and an enum value through a migration), not by changing code paths.
- **Reason:** FUTUREUNI's four service lines. The engine reads profiles, so line-specific behaviour is data.

### ADR-009: Markets
- **Status:** Accepted (fixed).
- **Decision:**
  - The `Market` enum is `NIGERIA` and `INTERNATIONAL`. A search can target one or both.
  - Every company, lead and message carries its market.
  - International records also carry an ISO 3166-1 alpha-2 country code, because compliance rules differ by country.
- **Reason:** sources, channels, tone, currency and law all differ between Nigeria and the rest of the world.

### ADR-010: Channels
- **Status:** Accepted (fixed).
- **Decision:**
  - Email is the only channel the system may send automatically.
  - WhatsApp, LinkedIn and phone are **assisted**: the system prepares the message and a human sends it. WhatsApp uses a pre-filled `https://wa.me/<digits>?text=…` click-to-chat link.
  - Nothing ever automates LinkedIn or sends unsolicited WhatsApp messages through an API (INV-7).
- **Reason:** platform terms and deliverability. Nigerian prospects answer WhatsApp faster than email, but automated WhatsApp and LinkedIn outreach breaks those platforms' terms and risks bans.

### ADR-011: Theme: light default, dark first-class
- **Status:** Accepted (fixed).
- **Decision:** the light theme is the default and is designed first. Dark mode is fully supported as layered navy depth (not an inversion), and users can switch. Tokens are in `.claude/project-rules.md` §"Brand and UI".
- **Reason:** the brand's lavender and navy palette reads best light-first, and dark mode matters for long working sessions.

### ADR-012: Parallel build protocol
- **Status:** Accepted (fixed).
- **Decision:**
  - Every phase runs in its own git worktree and branch `phase/<nn>-<slug>`, starts in plan mode, and touches only the paths it owns.
  - Changes elsewhere go to `phases/<nn>/REQUESTS.md` and are applied at merge. Each phase ends with `phases/<nn>/SUMMARY.md` and a `saas-review` pass.
  - Nothing is committed or merged unless the owner asks.
  - The protocol text lives in `CLAUDE.md`.
- **Reason:** parallel sessions can't coordinate live. Clear ownership, contracts and seams let them work without clashing.

---

## Decisions made in Phase 0

### ADR-013: Auth library: Better Auth
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:**
  - **Better Auth** 1.7.x.
  - **Auth.js / NextAuth:** v4 is `latest`; v5 is still `5.0.0-beta.32`.
- **Key facts:**
  - **Auth.js status:** on 22 Sep 2025 Auth.js "is now being maintained and overseen by Better Auth team", with security patches only, and new projects are pointed to Better Auth (https://better-auth.com/blog/authjs-joins-better-auth). NextAuth v5 never shipped stable, and `@auth/prisma-adapter` 2.11.3 declares no Prisma 7 support. Better Auth's peers include `prisma`/`@prisma/client` `^7` and `next` `^16`.
  - **Tables in Better Auth 1.7.6** (confirmed from the published package source):
    - `user`: id, name, email (unique), emailVerified, image, createdAt, updatedAt
    - `session`: id, expiresAt, token (unique), ipAddress, userAgent, userId, timestamps
    - `account`: id, accountId, providerId, userId, access/refresh/id tokens and expiries, scope, **password** (the credential hash lives here), timestamps
    - `verification`: id, identifier, value, expiresAt, timestamps
  - **Plugin fields:**
    - The `twoFactor` plugin adds `user.twoFactorEnabled` and a `twoFactor` table: secret, backupCodes (encrypted by default), userId, verified, failedVerificationCount, lockedUntil. TOTP is 6 digits over 30 seconds.
    - The `admin` plugin adds `user.role`, `banned`, `banReason` and `banExpires`, plus `session.impersonatedBy`.
    - Database rate limiting uses a `rateLimit` table (key unique, count, lastRequest as a bigint).
  - The unreleased `main` branch adds a required `account.issuer`, so pin the minor version and re-run the schema generator on upgrade.
  - **Security defaults to change:**
    - Rate limiting defaults to **in-memory** storage, which is useless on serverless.
    - `minPasswordLength` defaults to 8.
    - Sessions default to 7 days, with a 1-day `updateAge`.
    - Passwords hash with scrypt.
  - **Next.js:** `toNextJsHandler(auth)` at `app/api/auth/[...all]/route.ts`, `auth.api.getSession({ headers: await headers() })`, and `nextCookies()` as the **last** plugin.
- **Decision:** **Better Auth 1.7.x** (pin the minor), configured as follows.
  - Prisma adapter on Postgres.
  - Email and password with `disableSignUp: true`. Accounts come only from invites: Phase 3 creates the user inside `acceptInvite`.
  - `minPasswordLength: 12`.
  - Plugins `twoFactor()` (required for `ADMIN`), `admin()` and `nextCookies()`.
  - `rateLimit: { storage: "database" }`, with custom rules for sign-in, password reset, invite acceptance and 2FA.
  - Sessions of 30 days with sliding renewal (`auth.sessionDays`).
  - The admin plugin's string `role` maps to our `Role` enum (`defaultRole: "MEMBER"`). Better Auth is configured so Prisma's `cuid()` generates the IDs.
  - Optional Google sign-in behind `AUTH_GOOGLE_ENABLED`, restricted to `auth.googleAllowedDomains`.
- **Reason:** Better Auth is the actively developed successor and supports Prisma 7 and Next 16. It ships invite-only sign-up, TOTP 2FA, admin roles and bans, and a database rate limiter first-party, all stored in our own Postgres under a documented schema.
- **Sources:** https://github.com/better-auth/better-auth (docs: adapters/prisma, plugins/2fa, concepts/rate-limit, integrations/next); npm registry, checked 2026-09-25.

### ADR-014: Font pairing
- **Status:** Accepted, 2026-09-25.
- **Context:** the brand needs a distinctive display face, a highly readable UI sans and a data mono, all loadable with `next/font`. Inter, Roboto, Arial and system stacks are banned as primary faces.
- **Candidates:**

  | | A: Bricolage Grotesque + Instrument Sans + JetBrains Mono | B: Fraunces + Hanken Grotesk + IBM Plex Mono |
  |---|---|---|
  | Display | Bricolage Grotesque: a characterful grotesque with optical sizing (opsz 12–96), width (75–100) and weight (200–800). Confident and editorial at display sizes, and it pairs naturally with a violet/navy technology brand | Fraunces: a soft "wonky" old-style serif (opsz, SOFT, WONK axes). Very editorial, but warm and bookish, which sits less naturally with a digital agency's product UI |
  | UI | Instrument Sans (wght 400–700, wdth 75–100, italics): compact and highly legible in dense tables and forms, with tabular numerals available | Hanken Grotesk (wght 100–900): clean and neutral, but closer to the generic SaaS look the brief bans |
  | Mono | JetBrains Mono (variable wght 100–800): excellent digit distinction for money and IDs | IBM Plex Mono: good, but **static** weights mean larger downloads |
  | Risk | Two grotesques could blur. Mitigated by using Bricolage only for display and headings, at a large editorial scale | A serif display over dense data screens can feel like a magazine rather than a tool |

- **Decision:** **Pairing A.**
  - Display and headings: **Bricolage Grotesque** (`next/font/google` `Bricolage_Grotesque`, `axes: ["opsz", "wdth"]`).
  - Body and UI: **Instrument Sans** (`Instrument_Sans`, `axes: ["wdth"]`).
  - Data: **JetBrains Mono** (`JetBrains_Mono`).
  - They're exposed as CSS variables (`--font-display`, `--font-sans`, `--font-mono`) and mapped in Tailwind with `@theme inline`.
- **Reason:** Pairing A is distinctive without being decorative, stays readable in the data-dense screens that dominate this product, keeps every face variable (smaller payloads on slow Nigerian connections), and gives Phase 4 a clear display/UI contrast for the editorial scale.
- **Verified:** all three families exist in `next/font`'s font data for Next 16.3.6, and all are variable. Instrument Sans and Bricolage Grotesque keep the `tnum` feature in Google-served files; Google strips their stylistic sets, so self-host with `next/font/local` only if those are ever needed. Sources: `next@16.3.6` font-data.json and the `google/fonts` repository (`ofl/bricolagegrotesque`, `ofl/instrumentsans`), checked 2026-09-25.

### ADR-015: Personal-data retention period
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - Personal data (contact names, emails, phones, LinkedIn URLs, message and reply bodies, meeting notes and transcripts) linked to leads that are `DISQUALIFIED` or `LOST` is **anonymised 12 months** after the lead entered that status.
  - The period is configurable in the setting `platform.retention.personalDataMonths` (minimum 1, default 12).
  - Two jobs run the purges: `acquisition.compliance.retention-purge` (Phase 9, registered in the acquisition manifest) anonymises acquisition data, and `platform.retention-purge` (Phase 6) covers platform-owned data. Platform code never imports modules.
  - Anonymisation keeps non-personal analytics data (statuses, dates, amounts, service line, market).
  - A hashed suppression entry is kept when the person asked not to be contacted (INV-10).
  - Screenshots expire after 90 days (`platform.retention.screenshotsDays`). Stored AI prompt and response content (only when a task logs content) expires after 30 days (`platform.retention.aiContentDays`). Successful job runs are pruned after 90 days (`platform.retention.jobRunsDays`).
  - Audit log entries are kept indefinitely unless a legal retention period is set in `platform.retention.auditLogMonths` (default empty, meaning keep).
- **Reason:** 12 months covers a realistic re-engagement window for B2B services while meeting the data-minimisation and storage-limitation principles of the NDPA 2023 and UK GDPR, without a stated legal basis for keeping unused prospect data longer. Needs review by a qualified person before launch (Phase 20).

### ADR-016: Cold-outreach sending and reply ingestion
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:**
  - **(a) Google Workspace mailboxes** on dedicated outreach domains. Sending through the Gmail API `users.messages.send`, or the SMTP relay. Replies through `users.history.list` polling, or `users.watch` with Pub/Sub.
  - **(b) Microsoft 365 mailboxes.** Sending through Graph `sendMail`. Replies through per-folder `messages/delta` or webhooks.
  - **(c) A sending platform** (Instantly or Smartlead) through its API, on top of the same mailboxes.
- **Key facts:**
  - **Cost for 3–6 mailboxes:**
    - Workspace Business Starter is $7/user/month on an annual plan or $8.40 flexible, after the January 2025 Gemini price rise, so about $25–$50/month (https://knowledge.workspace.google.com/admin/billing/compare-flexible-and-annual-fixed-term-payment-plans). **Verify** the price shown to a Nigerian billing account.
    - M365 Business Basic is $7 from 1 Jul 2026.
    - Instantly Growth is $47/month and Smartlead Pro $94/month (API and webhooks), both on top of mailbox costs.
  - **Workspace limits:**
    - 2,000 messages/user/day. Our plateau of 30–40 per mailbox per day is about 2% of that.
    - **New or trial accounts are capped at 500/day** until $100 has been paid, and limits can take up to 75 days after that to rise (https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace).
    - The SMTP relay authenticates by IP address, and Vercel Functions have dynamic IPs, so **use the Gmail API**.
  - **Gmail API quota:** `messages.send` costs 100 units, `history.list` 2 and `messages.get` 20, with 6,000 units/minute per user. Polling 6 mailboxes every 5 minutes uses about 3.5k units/day, which is negligible. Standard use is free; billing above 80M units/day per project is planned for later in 2026 (https://developers.google.com/workspace/gmail/api/reference/quota).
  - **History windows:** history is kept "typically at least one week". A stale `startHistoryId` returns 404, which means a full sync.
  - **Push via `watch`:** must be renewed at least every 7 days, carries only the `historyId`, and can drop notifications, so polling stays the fallback (https://developers.google.com/workspace/gmail/api/guides/push).
  - **OAuth scopes and verification:**
    - `gmail.send` is Sensitive. `gmail.readonly`, `gmail.metadata` and `gmail.modify` are **Restricted**, needing verification plus a security assessment for public apps.
    - **Internal** apps (used only inside our own Workspace organisation) and domain-wide delegation are exempt (https://support.google.com/cloud/answer/13464323).
    - Outreach domains must be **secondary domains** (separate mailboxes), not alias domains.
  - **Terms apply to every option.** The Workspace acceptable use policy and Gmail policies prohibit unsolicited *mass* email and using multiple accounts to circumvent limits or filters (https://workspace.google.com/terms/use_policy/, https://developers.google.com/gmail/api/policy). Microsoft says Exchange Online isn't for bulk mail. The defensible posture is low-volume, personalised, lawful 1:1 B2B mail with suppression and opt-out. Warm-up pools are the practice Google's policy targets.
  - **Sender requirements:**
    - Gmail and Yahoo require SPF or DKIM, valid PTR, TLS and a spam rate under 0.3% for all senders. Bulk senders (about 5,000/day to personal Gmail, a status that is permanent once reached) must also have SPF **and** DKIM, aligned DMARC, and RFC 8058 one-click unsubscribe, with unsubscribes honoured within 48 hours.
    - Gmail has been rejecting non-compliant traffic since November 2025 (https://support.google.com/a/answer/81126).
    - Outlook.com has enforced SPF, DKIM and DMARC for senders above 5,000/day since 5 May 2025.
    - We implement all of it regardless of volume.
- **Decision:** **Option (a), Google Workspace Business Starter with the Gmail API.**
  - **Tenant:** a **dedicated outreach Workspace tenant**, separate from FUTUREUNI's main email. Its 2–3 outreach domains are the primary plus **secondary** domains, with 1–2 mailboxes each.
  - **Auth:** an **Internal** OAuth app, or domain-wide delegation, in a Google Cloud project owned by that tenant, with scopes `gmail.send` + `gmail.readonly`. Refresh tokens or keys are stored in the credentials vault.
  - **Sending:** raw RFC 5322 MIME through `users.messages.send`. We set `List-Unsubscribe`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and the threading headers, then read back the stored `Message-ID` with `messages.get` (Gmail may replace ours).
  - **Replies:** polled with `history.list` every 5 minutes, with a full-sync fallback on 404. `users.watch` with Pub/Sub is an optional later addition.
  - **Warm-up:** no warm-up network. A manual ramp from 5/day to 30–40/day with real, reviewed messages.
  - **Fallbacks:** `smtp` and `imap` adapters stay available (OAuth or app passwords, since basic auth is off in Workspace).
- **Reason:** Workspace is cheapest at our mailbox count, has the most headroom, and gives exact control of headers and IDs for threading and RFC 8058, with trivial API cost. A dedicated tenant keeps the app "Internal", so no restricted-scope security assessment is needed, and keeps enforcement against outreach mailboxes away from FUTUREUNI's primary email. M365 has clumsier delta sync and returns no sent-message ID. A platform adds cost for warm-up pools we deliberately avoid.
- **Verify in Phase 12 / 21 by testing:**
  - That Gmail preserves our `List-Unsubscribe` headers and DKIM covers them (send to a test Gmail account and check "Show original").
  - Whether one domain-wide-delegation client can serve separate tenants.
  - Minting a delegation assertion through Vercel OIDC with Workload Identity Federation, since service-account keys are blocked by default in new Google Cloud organisations.

### ADR-017: Headless browser runtime on Vercel
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:**
  - **(a) Vercel Sandbox** running Playwright and Chromium.
  - **(b) `@sparticuz/chromium`** with `playwright-core` in a Vercel Function.
  - **(b′) Vercel Functions container images** (beta since 30 Jun 2026).
  - **(c) A hosted browser** (Browserbase, Browserless) **or a screenshot API** (ScreenshotOne, Urlbox).
- **Key facts:**
  - **Our needs:** mobile and desktop captures, axe results, console errors, HTML, og:images, click-through by **visible text** (navigation only), and a hard 20-second timeout.
  - **Screenshot APIs** can't return axe results or console errors, and they click by CSS selector, so they fail our requirements.
  - **Vercel Sandbox:**
    - GA since 30 Jan 2026, with Firecracker microVM isolation, OIDC authentication by default, and **snapshots** to pre-install Chromium. Sessions last up to 24 hours on Pro.
    - It costs $0.128/CPU-hour plus $0.0212/GB-hour (1-minute minimum), so about **$0.002 per capture**: roughly $10/month at 5,000 leads, and less if captures are batched.
    - Sources: https://vercel.com/docs/sandbox, https://vercel.com/docs/sandbox/pricing
  - **Functions:**
    - Pro allows 4 GB / 2 vCPU and 800 seconds. Bundles can be 250 MB, or up to 5 GB in the large-functions beta.
    - `@sparticuz/chromium` 153 is actively maintained, and Next.js treats it and `playwright-core` as server externals. It costs about $0.0008 per capture, but its Chromium build targets Lambda-style runtimes, and it would run inside a function that can see our app's secrets.
- **Decision:**
  - **Primary: `vercel-sandbox`.**
    - A snapshot, or a custom Vercel Container Registry image, holds Node, Playwright, its bundled Chromium, `@axe-core/playwright` and fonts (Noto).
    - It's launched from a Workflow step, 5–20 captures per sandbox, with the 20-second timeout enforced per capture plus a sandbox-level timeout.
    - It returns JSON (axe results, console errors, og:images, HTML hash) and uploads WebP screenshots to private Blob.
  - **Fallback: `serverless-chromium`,** `@sparticuz/chromium` + `playwright-core` in a **separate, secret-free Vercel project** called with an HMAC-signed request.
  - **Development:** `local-playwright`.
  - **Tests:** `mock`.
  - **Safety rules** (SSRF and robots checks before every capture, navigation only, never typing or submitting) are in `docs/contracts/audit-agent.md`.
- **Reason:** we load untrusted third-party pages. Sandbox isolates them in a microVM with none of our secrets, uses stock Playwright Chromium, is GA, and costs next to nothing at our volume. The function fallback is cheaper but less isolated, so it lives in its own project.

### ADR-018: AI model tiers and configuration
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - Every AI task declares a **tier**, `fast`, `balanced` or `deep`, never a model name.
  - Tiers map to model IDs through configuration: the env variables `AI_MODEL_FAST`, `AI_MODEL_BALANCED` and `AI_MODEL_DEEP` provide defaults, and the `ai.modelTiers` setting (`ADMIN` only) overrides them at runtime.
  - An optional fallback model per tier comes from the same config.

  **Defaults** (Claude API model list and pricing as cached on 2026-06-24, https://platform.claude.com/docs/en/about-claude/pricing; Phase 5 re-verifies):

  | Tier | Model ID | Input / output per 1M tokens | Used for |
  |---|---|---|---|
  | `fast` | `claude-haiku-4-5` | $1 / $5 | Classification, extraction, reply classification, briefs |
  | `balanced` | `claude-sonnet-5` | $2 / $10 | Outreach drafts, vision audits, borderline reviews, pre-call briefs |
  | `deep` | `claude-opus-5` | $5 / $25 | Proposal prose |

  - Prompt-cache reads cost about 0.1× the input price; 5-minute cache writes cost 1.25× and 1-hour writes 2×. The Message Batches API is 50% cheaper for non-urgent bulk work, such as re-scoring.
  - `claude-opus-5-5` ($4 / $20) is launching as a cheaper Opus. Switch `deep` to it through config once Phase 5's evals show no loss.
  - Haiku 4.5's minimum cacheable prefix is 4096 tokens, so fast-tier prompts should put the shared skill first to benefit from caching.
  - **Claude Haiku 4.5 may be retired "not sooner than 15 October 2026"** (https://platform.claude.com/docs/en/about-claude/models/overview). Phase 5 checks the models list when it runs. If Haiku 4.5 is retiring, it points `AI_MODEL_FAST` at its successor, or at `claude-sonnet-5` with low effort, and re-runs the fast-tier evals. It's a config change only.
  - Newer models reject sampling parameters such as `temperature`, and use `effort` as the tuning control. Task definitions treat temperature as optional, and the adapter drops unsupported parameters (`docs/contracts/ai-service.md`).
  - The Anthropic usage policy prohibits using Claude to generate or distribute spam (https://www.anthropic.com/legal/aup). Outreach stays targeted, low-volume, cited and human-reviewed (ADR-016, INV-5).
- **Reason:** switching models becomes a configuration change that the eval harness verifies. Cost stays proportional to task difficulty.

### ADR-019: Database connectivity (Neon + Prisma)
- **Status:** Accepted, 2026-09-25 (details are verified by Phase 2 against the installed Prisma version).
- **Decision:**
  - **Prisma 7.** Pin `prisma@^7` and `@prisma/client@^7`. `prisma@latest` is currently `8.0.0-rc.17`, a rewrite that lacks features we rely on (`$extends`, atomic `increment`, `P2002` codes); Better Auth's peer range stops at `^7`.
  - **One code path everywhere:** `@prisma/adapter-pg` over a `pg` `Pool`, registered with `attachDatabasePool(pool)` from `@vercel/functions` so Fluid Compute manages idle connections.
    - In Vercel, `DATABASE_URL` is Neon's **pooled** URL. Locally and in CI it points at Docker Postgres.
    - The client is a hot-reload-safe singleton in `src/platform/db/client.ts`.
  - **Migrations use the direct connection.** In Prisma 7 the CLI's URL lives in `prisma.config.ts` (`datasource.url = env("DIRECT_URL")`); there is no `url` or `directUrl` in the schema file.
    - In Vercel, `DIRECT_URL` is set to the Neon integration's `DATABASE_URL_UNPOOLED`.
    - `prisma.config.ts` must `import "dotenv/config"`, because Prisma 7 no longer loads `.env` itself.
  - **Schema files:** the multi-file schema lives in `prisma/schema/` (GA since 6.7). The migrations folder sits next to the file holding the `generator` block. The generator is `prisma-client` with a required `output` (`src/generated/prisma`, gitignored, owned by Phase 2).
  - **Seeding and generation:** seeding is configured with `migrations.seed` and runs only through `pnpm db:seed`. `migrate dev` no longer seeds or generates automatically.
  - **Extensions and constraints:** `pg_trgm` and `citext` are created with `CREATE EXTENSION IF NOT EXISTS` in the init migration. The `postgresqlExtensions` preview feature is being discontinued. Partial unique indexes, CHECK constraints and trigram indexes are raw SQL in the migration. The `partialIndexes` preview flag (7.4+) is optional.
  - **Production migrations** run only from CI in a controlled deploy step, never from a laptop against production (Phase 21).
- **Reason:** Neon's and Prisma's current Vercel guidance for Fluid Compute is standard TCP with a pool. One adapter keeps local and production identical, and migrations need a direct (non-pooler) connection.
- **Sources:**
  - Prisma release status and v7 docs: https://www.prisma.io/docs/orm/release-status, https://www.prisma.io/docs/orm/v7/prisma-schema/postgresql-extensions
  - Prisma extensions discussion: https://github.com/prisma/prisma/discussions/26136
  - Neon's Prisma guide: https://neon.com/docs/guides/prisma
  - npm dist-tags, checked 2026-09-25.
- **Open risk:** Docker isn't installed on the build laptop (checked 2026-09-25). Install Docker Desktop before Phase 1: `docker-compose.yml` and `pnpm phase start` (which clones databases with `createdb -T`) depend on it. The fallback is a Neon development branch per worktree.

### ADR-020: Email finder and verifier: Hunter
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:** Hunter (Domain Search, Email Finder, Email Verifier) or Apollo (people enrichment).
- **Key facts:**
  - **Hunter's API is on every plan, including Free** (50 credits/month).
    - Starter is $49/month, or $34/month on an annual plan, for 2,000 credits.
    - A find costs 1 credit and a verification about 0.5 credit (**verify**).
    - Rate limits: 15 requests/second for Domain Search and Finder, 10/second for the Verifier.
    - Verifier statuses are `valid`, `invalid`, `accept_all`, `webmail`, `disposable` and `unknown`.
    - **HTTP 451 `claimed_email`** marks a person who asked Hunter to stop processing their data.
    - Hosting is on Google Cloud in Belgium, and a DPA is available.
    - Sources: https://hunter.io/pricing, https://hunter.io/api-documentation/v2
  - **Apollo** is priced per seat. Its API access by plan is unclear (**verify**), it has no standalone verifier, and its contributor-network sourcing is harder to defend in a legitimate-interest assessment.
- **Decision:** **Hunter**, starting on Starter, with adapters `hunter` and `mock`. Verifier statuses map to `EmailStatus`:
  - `valid` → VALID
  - `accept_all` / `unknown` → RISKY / UNKNOWN (low priority; review)
  - `webmail` → RISKY, flagged as a possible individual subscriber (PECR, INV-6)
  - `invalid` / `disposable` → INVALID
  - **451 → an automatic EMAIL suppression** (reason `OBJECTION`, source `PROVIDER_SIGNAL`, note `hunter:claimed_email`)
- **Reason:** a one-to-one fit with the enrichment pipeline, per-result pricing, EU hosting, and an explicit objection signal that helps our NDPA and GDPR posture.

### ADR-021: Calendar and booking provider: Cal.com
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:** Cal.com (cloud), or Google Calendar appointment schedules with Calendar API watch channels.
- **Key facts:**
  - **Cal.com webhooks:** `BOOKING_CREATED`, `BOOKING_RESCHEDULED` and `BOOKING_CANCELLED` (among others), signed with **HMAC-SHA256 of the raw body in `x-cal-signature-256`** (https://cal.com/docs/developing/guides/automation/webhooks).
  - **Prefilling:** booking questions can be prefilled from the URL and hidden. `metadata[...]` pass-through to webhooks had a reported regression, so **verify** it.
  - **Pricing:** Free for 1 user; Teams $12/user/month (annual). Whether the Free plan includes webhooks and API v2 is **verify**.
  - **Google appointment schedules:** no management API found. Their watch channels carry no body and are unreliable.
- **Decision:**
  - **Cal.com (cloud)**, backed by each owner's Google Calendar, with Google Meet as the location. Adapters are `cal-com` and `mock`.
  - Per-lead booking links carry a signed lead reference (`BOOKING_LINK_SECRET`) in a **hidden prefilled booking question `leadRef`**, plus `metadata[leadRef]` once a live test confirms it reaches webhooks.
  - Webhooks are verified on the raw body with a constant-time compare and deduplicated through `WebhookEvent`.
- **Reason:** attributable per-lead links, signed lifecycle webhooks and a free single-user tier. Google Calendar stays underneath for availability and Meet links.

### ADR-022: Proposal and handoff PDF rendering: `@react-pdf/renderer`
- **Status:** Accepted, 2026-09-25 (researched).
- **Options:** `@react-pdf/renderer`, HTML→PDF in a headless browser, or `pdf-lib`.
- **Key facts:**
  - `@react-pdf/renderer` 4.9.0 (August 2026) supports React 19, renders in Node with `renderToBuffer`, registers custom fonts (TTF is the safe choice), and is already a default Next.js server external.
  - HTML→PDF needs Chromium (see ADR-017).
  - `pdf-lib` hasn't been released since May 2022.
  - Sources: https://github.com/diegomura/react-pdf, https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages
- **Decision:**
  - `@react-pdf/renderer` 4.9.x, rendered in a Node route handler or Workflow step and stored in private Blob (`FileObject` purposes `PROPOSAL_PDF` and `HANDOFF_PDF`).
  - Brand fonts are bundled as TTF and registered with `Font.register`.
  - The layout follows `.claude/project-rules.md` §"Output/document rules".
- **Reason:** typed React layouts with brand fonts, sub-second rendering in an ordinary function, and no Chromium dependency.

### ADR-023: Platform (transactional) email
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - Platform email (invites, verification, password reset, role changes, 2FA, notifications, digests, budget warnings) goes through an `EmailSender` adapter with `resend` and `mock` implementations. Templates are React Email, with a plain-text version of each.
  - It is **completely separate** from cold-outreach sending (ADR-016): different provider, different domain and different code path.
  - The sending domain is a platform mail subdomain, TODO(confirm) with Prince.
- **Reason:** transactional mail must always arrive and must never share reputation with cold outreach.

### ADR-024: Package manager and Node.js version
- **Status:** Accepted, 2026-09-25.
- **Decision:** pnpm, pinned through the `packageManager` field, on Node.js 24 LTS, pinned in `.nvmrc` and `engines`. This laptop has Node 24.19.0 and pnpm 11.3.0.
- **Reason:** pnpm's shared store makes git worktrees cheap (`pnpm phase start` installs quickly). Node 24 is Vercel's current default LTS; Node 20 is deprecated on Vercel from 1 October 2026.

### ADR-025: Execution in batches and the seam rule
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - Phases run in the batches of `docs/prompts/RUN-GUIDE.md`, never more than 3 terminals at once. The batch table is recorded in `phases/README.md`.
  - **Seam rule:** if the phase providing a seam is already merged on `main`, the consumer calls the real code and writes no stand-in. If the provider runs in parallel, the consumer builds the stand-in exactly as specified and notes it in `REQUESTS.md`.
  - The rules are in `CLAUDE.md` §"Running phase prompts".
- **Reason:** one laptop can't run 4 parallel sessions comfortably. Reordering (Phase 4 after 3 and 6; Phases 8 and 10 after 7 and 9; Phase 13 after 12 and 14) cuts the number of stand-ins and integration work.

### ADR-026: Complete ownership map from day one
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - The ownership map in `CLAUDE.md` already contains every path the later "Part A1" prep steps add (for example `src/platform/events/**`, `src/platform/http/**`, `src/platform/browser/**`, per-task `runtime-skills/` and `evals/` globs, `.claude/settings.json` for Phase 1's hooks, and `tests/e2e/phase-<nn>/**`).
  - Where patterns nest, the most specific pattern wins.
  - Paths created by one phase and owned by another are listed as grants.
  - The Part A1 prep steps become a verification plus the duplicate check.
- **Reason:** a missing path blocks a parallel phase at the guard. A complete map, decided once, avoids that and keeps exactly one owner per path. It also fixes one inconsistency in the prompts: Phase 7's eval folder follows the runner's `evals/<module>/<task>/` layout (`evals/acquisition/profile-*`), and `evals/acquisition/profiles/**` is kept for it too.

### ADR-027: Internal cost unit: integer micro-USD
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - Internal cost accounting (AI calls, provider calls, audits, search runs, the cost per lead) is stored as `costMicros`: an integer count of millionths of a US dollar.
  - Client money (deal values, proposal prices) stays in integer minor units plus a currency (INV-11).
  - The two are never mixed or summed with each other.
- **Reason:** a single fast-tier AI call or Places request costs a fraction of a cent. Cent-based minor units would round it to zero and make cost-per-lead analytics wrong. Integers keep floating-point money out of the database.

### ADR-028: AI service entry point is `runTask`
- **Status:** Accepted, 2026-09-25.
- **Decision:**
  - The Phase 0 brief's `ai.run({ task, promptVersion?, input, outputSchema, context })` maps to `runTask({ task, input, actor, context?, images?, options? })` from Phase 5's prompt.
  - The output schema lives on the registered **task definition**, not on each call, so a task always validates the same way. `options.promptVersion` pins a version.
  - The contract is `docs/contracts/ai-service.md`.
- **Reason:** keeping the schema on the task makes evals, repair and logging consistent per task. Phase 5 "implements the contract exactly", so the contract uses Phase 5's names.

### ADR-029: Module milestones map to build phases
- **Status:** Accepted, 2026-09-25.
- **Decision:** the milestones in `docs/specs/module-acquisition.md` §11 map to build phases 7–19, each with numbered acceptance criteria (`M<phase>-AC<n>`) that the phase prompts quote. They are horizontal build slices, not saas-plan's default vertical milestones.
- **Reason:** the parallel build protocol needs work split by folder ownership. End-to-end slices are proven at each wave integration and in Phase 19 instead.

### ADR-030: Monitoring: Sentry
- **Status:** Accepted, 2026-09-25.
- **Decision:** Sentry for server and client error tracking, with PII scrubbing (emails, phones, message bodies), releases tied to deployments, and source maps uploaded privately. It's switched on in Phase 21. Structured logs carry no personal data.
- **Reason:** saas-ship's default, with a free tier that fits a small internal team (see `docs/integrations.md`).

### ADR-031: No open tracking or link rewriting by default
- **Status:** Accepted, 2026-09-25.
- **Decision:** outreach email carries no open-tracking pixels and no rewritten links. Engagement metrics come from sends, replies, bounces and meetings. A setting may enable click tracking later, only through a new ADR that records the deliverability and privacy trade-off.
- **Reason:** pixels and rewritten links hurt deliverability on fresh outreach domains, collect personal data for little value, and open-rate data is unreliable because of mail privacy proxies.

### ADR-032: Invariant 9 covers ACTIVE and PAUSED enrolments
- **Status:** Accepted, 2026-09-25.
- **Decision:** the partial unique index that enforces "one active outreach thread per company" (INV-9) covers enrolments in status `ACTIVE` **or** `PAUSED`, not only `ACTIVE` as Phase 2's prompt words it. A paused thread (for example out-of-office) is still an open conversation.
- **Reason:** without this, an out-of-office pause would let a second line open a parallel thread with the same company, which is exactly what INV-9 forbids. Phase 2's SQL proof (a second `ACTIVE` enrolment fails) still holds.

### ADR-033: Vercel project config stays in `vercel.json`
- **Status:** Accepted, 2026-09-25.
- **Decision:** Vercel configuration lives in `vercel.json`, as the phase prompts assume. It holds one cron entry (`/api/cron/tick`, every 5 minutes) plus any function settings Workflow requires. Vercel now recommends `vercel.ts` (`@vercel/config`) for typed config. A later phase may switch through an ADR, but no phase should do it silently.
- **Reason:** every phase prompt, and Phase 6's change request, refers to `vercel.json`. Changing format mid-build would create merge friction for no functional gain.

### ADR-034: Compliance posture pending legal review
- **Status:** Accepted, 2026-09-25 (researched). This is **not legal advice**: a qualified person must review it before launch (Phase 20/21 launch gate).
- **Context:** the fixed decisions let FUTUREUNI prospect in Nigeria and internationally. Research on 2026-09-25 found three things that change the default risk.
  - **Nigeria:**
    - The NDPC's General Application and Implementation Directive (GAID 2025, in force 19 Sep 2025) Art. 18(1)(a) says consent is required "for any direct marketing activity", with no B2B carve-out in the text.
    - Art. 26 requires a documented legitimate-interest assessment (Schedule 8 template) before relying on legitimate interest.
    - NDPA 2023 breach notification to the NDPC is due within 72 hours.
    - Source: https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf.
    - FUTUREUNI is a Nigeria-domiciled controller, so whether GAID also reaches its outreach to non-Nigerian prospects is an open legal question.
  - **UK:** PECR forbids cold email to individual subscribers (sole traders, some partnerships) without consent, and the soft opt-in doesn't cover prospects. The Data (Use and Access) Act 2025 raised PECR fines to £17.5m or 4% of turnover from 5 Feb 2026 (https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/).
  - **EU:** Germany's UWG §7(2) requires prior express consent for email advertising, including B2B (https://www.gesetze-im-internet.de/uwg_2004/__7.html). Austria, Italy, Spain and Belgium are reported as consent-based (**verify** per country). France (CNIL) allows B2B prospecting relevant to the recipient's profession, with an easy opt-out.
  - **US:** CAN-SPAM has no B2B exception. It requires honest headers and subjects, a physical postal address, and a working opt-out honoured within 10 business days (https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- **Decision:** the country rules table (Phase 9, `docs/contracts/enrichment.md` rule 15) starts from these defaults.
  - **`NG`:**
    - Every legal form is `REVIEW` while the new setting `acquisition.compliance.ngDirectMarketingBasis` is `PENDING_LEGAL_REVIEW` (the default). Nigerian leads also get `complianceReview`, so every Nigerian first touch, by any channel, shows a compliance notice in the review queue.
    - `ADMIN` sets the setting to `LEGITIMATE_INTEREST_CONFIRMED` (email to incorporated bodies becomes `ALLOWED`) or `CONSENT_ONLY` (email becomes `CONSENT_REQUIRED`) only after recording counsel's view and the Art. 26 assessment. The change is audited.
  - **`GB`:** INV-6.
  - **`DE`, `AT`, `IT`, `ES`, `BE`:** `CONSENT_REQUIRED`.
  - **`US`, `CA`, `IE`, `FR`, `NL`:** `ALLOWED` for incorporated bodies, with unsubscribe and postal address (INV-4).
  - **Everything else:** `REVIEW`.
  - **Launch gate (Phase 21):** Nigerian counsel's written view on GAID Art. 18 and 26, plus a legitimate-interest assessment, before any Nigerian outreach. General legal review of the table before any outreach.
- **Reason:** the defaults are conservative, reversible (settings and typed data, no code change) and visible to reviewers. They let the whole engine be built and tested now without deciding a legal question the build team can't answer.
