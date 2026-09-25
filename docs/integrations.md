# Integrations register

Every external service the FUTUREUNI Internal Platform uses, what it's for, which phase builds its adapter, whether a mock exists, and what it costs. Prices, free tiers and terms were **verified on 2026-09-25** from the source URLs given. Anything that couldn't be confirmed on an official page is marked **verify**.

**Rules** (from `.claude/project-rules.md` and ADR-005):
- Every service is reached through an adapter with a **`mock`** implementation. The platform works end to end with `MOCKS=true` and no keys.
- Adapters read secrets from the **credentials vault first** (`/admin/integrations`, AES-256-GCM, INV-21), then the env variable in `.env.example`. Nothing is read in the browser.
- Real providers are switched on one at a time in Phase 21, in the order in §4, and each switch is recorded in `docs/go-live-log.md`.

---

## 1. Register

| Service | Purpose | Used by phase | Adapter id | Mock available | Free tier or trial | Pricing notes | Signup link | Needed before go-live? |
|---|---|---|---|---|---|---|---|---|
| **Anthropic API (Claude)** | Every AI task through `src/platform/ai` (briefs, drafts, classification, vision audits, proposals) | 5 (service); 7–14, 17 (tasks) | `anthropic` | Yes (`mock`, deterministic fixtures) | Small free credits for new accounts | Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25, Opus 5.5 $4/$20 per MTok in/out. Cache reads ~0.1× input; 5-minute cache writes 1.25×; Batches 50% off. Rate-limit tiers Start/Build/Scale with monthly spend caps of $500, $1,000 and $200k | https://platform.claude.com/ | Yes |
| **Vercel Pro** | Hosting, Functions (Fluid Compute), deploys, previews | 1, 21 | — | n/a | Hobby is non-commercial only | $20/month, including one deploying seat and a $20 usage credit; usage beyond that is on demand | https://vercel.com/pricing | Yes |
| **Neon Postgres** (Vercel Marketplace) | Primary database; a branch per preview | 2, 21 | — (Prisma, ADR-019) | Docker Postgres locally | Free: 100 CU-h/project, 0.5 GB, **6-hour history** | Launch: $0.106/CU-h, $0.35/GB-month, history up to 7 days. Scale: $0.222/CU-h, history up to 30 days. No monthly minimum. **Production needs Launch or higher** for point-in-time restore | https://vercel.com/marketplace/neon | Yes |
| **Vercel Blob** | Screenshots, proposal and handoff PDFs, CSV uploads, DSR exports (private store) | 6, 10, 14 | `vercel-blob` | Yes (`local` driver writing to `.storage/`) | Hobby: 1 GB, 10k simple and 2k advanced ops | Pro: $0.023/GB-month, $0.40 per 1M simple ops, $5 per 1M advanced ops, paid from the $20 credit. Private stores are GA (`@vercel/blob` ≥ 2.3). Access mode is fixed at store creation | Vercel dashboard → Storage | Yes |
| **Vercel Workflow + Cron** | Durable jobs and the single `/api/cron/tick` schedule | 1, 6, 19 | `workflow` package | Yes (inline test runner; local world) | Hobby: 50k events and 1 GB written a month | Workflow events $0.02 per 1k, data written $0.50/GB, retained $0.50/GB-month; run data kept 7 days on Pro. Cron: 100 jobs/project, 1-minute minimum, **UTC only**, best effort (idempotent handlers). Functions: 300 s default, 800 s maximum | Built into the project | Yes |
| **Google Places API (New)** | Find local businesses (Text Search); `no_website` signal | 8 | `google-places` | Yes | Per-SKU monthly free caps: Essentials 10k, Pro 5k, Enterprise 1k; Text Search "IDs only" is free | Text Search Pro $32 per 1k; **Enterprise $35 per 1k** (charged when requesting `websiteUri` or phone fields); Place Details Essentials $5 per 1k, Pro $17 per 1k. **Terms: store only `place_id`** (see §2) | https://console.cloud.google.com/google/maps-apis/ | Yes (for Places sourcing) |
| **Google PageSpeed Insights API v5** | Web Development audits (performance, SEO basics) | 10 | `audit.web` (provider ID `pagespeed`) | Yes | Free | Free with an API key. Default quota about 25,000/day and 400 per 100 s (**verify** in the Cloud console). Lab data only: Google is dropping CrUX field data from this API | https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com | Yes (web audits) |
| **YouTube Data API v3** | `youtube-channels` sourcing; Video Editing audits | 8, 10 | `youtube-channels`; `audit.video` (provider ID `youtube-data`) | Yes | Free quota | 10,000 units/day for list endpoints (1 unit each), plus a **separate 100 calls/day for `search.list`**. Public data may be stored ≤ 30 days | https://console.cloud.google.com/apis/library/youtube.googleapis.com | Yes (video line) |
| **SerpApi (Google Jobs engine)** | Job-post signals in Nigeria and internationally | 8 | `jobs-serpapi` | Yes | 250 searches/month free | Starter $25 (1k/month), Developer $75 (5k), Production $150 (15k). Only successful searches count. Google's lawsuit against SerpApi is ongoing (supply risk) | https://serpapi.com/pricing | Yes (job signals) |
| **Adzuna API** | International job-post signals | 8 | `jobs-adzuna` | Yes | Free key; **commercial use only as a 14-day trial** | No public price; a licence is by contact. 25/min, 250/day, 2,500/month. 19 countries, **not Nigeria**. **Terms forbid contacting listing suppliers**, so the adapter is **disabled by default** | https://developer.adzuna.com/ | No (only with a licence) |
| **MyJobMag feeds** (Nigeria) | Nigerian job-post signals from public RSS/XML feeds | 8 | `myjobmag` | Yes | Free public feeds | No API. Feeds such as `jobsxml.xml` and `aggregate_feed.xml` are allowed by robots.txt, and the terms have no anti-scraping clause. **Confirm feed use with MyJobMag** (services@myjobmag.com) before live use | https://www.myjobmag.com/feeds/ | Optional |
| **Jobberman** (Nigeria) | Would be Nigerian job-post signals | 8 | `jobberman` | Yes | No API | **Disabled:** terms clause 22 bans robots and scraping without written approval, and robots.txt disallows `/job/` | https://www.jobberman.com/terms | No |
| **Apple iTunes Search API + App Store reviews RSS** | `apple-app-store` sourcing; UI/UX review analysis | 8, 10 | `apple-app-store` | Yes | Free, no key | About 20 calls/minute. Terms limit promotional content (artwork) to promoting store content, so we never display it. The reviews RSS feed is legacy and undocumented (best effort) | https://performance-partners.apple.com/search-api | Yes (UI/UX line) |
| **Hunter.io** | Email finder (domain search, finder) and verifier | 9, 13 | `hunter` | Yes (plus Hunter's `test-api-key`) | Free: 50 credits/month, API on every plan | Starter $49/month ($34 annual) for 2,000 credits; Growth $149 ($104) for 10k. A find costs 1 credit; a verification about 0.5 (**verify**). HTTP 451 `claimed_email` → suppression (ADR-020) | https://hunter.io/pricing | Yes |
| **Apollo.io** (alternative, not chosen) | — | — | — | — | Free plan | Per-seat (Basic $49, Professional $99 per user/month); API access by plan unclear (**verify**) | https://www.apollo.io/pricing | No |
| **UK Companies House API** | UK legal form for PECR (INV-6) | 9 | `companies-house` | Yes | Free | 600 requests per 5 minutes per key | https://developer.company-information.service.gov.uk/ | Yes (UK prospects) |
| **Resend** | Platform (transactional) email only: invites, resets, notifications, digests | 6 | `resend` | Yes (console plus an in-memory outbox) | Free: 3,000/month, 100/day, 3 domains | Pro $20/month for 50k. **The AUP forbids cold outreach, purchased lists and scraped contacts**, which is why it's never used for outreach (ADR-023) | https://resend.com/pricing | Yes |
| **Google Workspace (outreach mailboxes)** | Cold-outreach sending from dedicated domains (ADR-016) | 12, 21 | `gmail-api` (fallback `smtp`) | Yes (`mock` records sends) | 14-day trial; **new accounts are capped at 500 sends/day until $100 has been paid** | Business Starter $7/user/month annual or $8.40 flexible, so about $25–$50/month for 3–6 mailboxes (**verify** the NGN price). A dedicated outreach tenant; an **Internal** OAuth app with `gmail.send` + `gmail.readonly` | https://workspace.google.com/pricing | Yes |
| **Gmail API (reply ingestion)** | Poll outreach mailboxes for replies (`history.list`) | 13 | `gmail-api` (fallback `imap`) | Yes (scripted replies) | Free within quota | 6,000 units/minute per user; `history.list` 2 units, `messages.get` 20. Polling 6 mailboxes every 5 minutes uses about 3.5k units/day. Billing above 80M units/day per project is planned for later in 2026 | https://console.cloud.google.com/apis/library/gmail.googleapis.com | Yes |
| **Cal.com (cloud) on Google Calendar** | Booking links, booking webhooks, Meet links (ADR-021) | 14 | `cal-com` | Yes | Free for 1 user | Teams $12/user/month (annual). Webhooks signed with HMAC-SHA256 (`x-cal-signature-256`); API v2 at 120 requests/minute. Free-plan webhooks and API access: **verify** | https://cal.com/pricing | Yes |
| **Vercel Sandbox** (primary browser runtime) | Screenshots, axe, click-through for audits (ADR-017) | 10 | `vercel-sandbox` | Yes (`mock`; `local-playwright` for development) | Hobby includes 5 CPU-h a month | $0.128/CPU-h plus $0.0212/GB-h (1-minute minimum), so about $0.002 per capture (~$10/month at 5,000 leads). OIDC auth; snapshots pre-install Chromium | Vercel dashboard | Yes (UI/UX and graphic audits) |
| **`@sparticuz/chromium`** (fallback runtime) | Captures in a separate, secret-free Vercel project | 10 | `serverless-chromium` | — | Free (MIT) | Function cost about $0.0008 per capture (4 GB / 2 vCPU) | https://github.com/Sparticuz/chromium | No (fallback) |
| **Sentry** | Error tracking with PII scrubbing (ADR-030) | 21 (wiring 1) | — (SDK) | n/a (disabled without a DSN) | Developer: free, 1 user, 5k errors/month | Team $26/month (annual) for 50k errors and unlimited users. Integrations on the Developer plan: **verify** | https://sentry.io/pricing/ | Yes |
| **Google Cloud project** | Holds the API keys for Places, PageSpeed and YouTube; OAuth client for Gmail (outreach tenant) | 8, 10, 12, 21 | — | n/a | — | Set **API key restrictions and a billing budget alert** (Phase 21) | https://console.cloud.google.com/ | Yes |
| **Domain registrar** | 2–3 outreach domains and the platform mail subdomain | 21 | — | n/a | — | About $10–$15 per domain per year (**verify** with the chosen registrar) | Prince's choice | Yes |

**Estimated fixed monthly cost at launch** (low volume): Vercel Pro $20 + Neon Launch (usage-based, likely $5–$20) + Workspace 3–6 mailboxes ($25–$50) + Hunter Starter ($34–$49) + SerpApi Starter ($25) + Resend free + Sentry free + Cal.com free = **roughly $110–$165/month before Anthropic and Google usage**. Phase 20's `docs/cost-model.md` replaces this with measured costs per lead.

---

## 2. Terms that shape the design

- **Google Maps Platform (Places):**
  - Only `place_id` may be stored indefinitely, and coordinates for 30 days.
  - The terms forbid copying or saving business names, addresses or reviews, and using Places data in a listings or directory service (https://cloud.google.com/maps-platform/terms §3.2.3; https://cloud.google.com/maps-platform/terms/maps-service-terms).
  - So the directory stores the `place_id` only and fetches display fields live (module spec §3.5.1). Keep field masks minimal: website and phone fields bill at the Enterprise rate (https://developers.google.com/maps/documentation/places/web-service/data-fields).
- **YouTube API Services:** non-authorised public data may be stored for at most 30 days, scraping is prohibited, and quota increases need a compliance audit (https://developers.google.com/youtube/terms/developer-policies).
- **Adzuna:** permitted uses are publishing listings or personal research. Other commercial use is a 14-day trial, and "any attempt to contact a third party … will be considered a breach" (https://developer.adzuna.com/docs/terms_of_service). **Disabled by default.**
- **Jobberman:** terms clause 22 bans robots and scraping without written approval, and robots.txt disallows `/job/` and query pages (https://www.jobberman.com/terms, https://www.jobberman.com/robots.txt). **Disabled.**
- **MyJobMag:** public XML feeds are allowed by robots.txt (`/*?` is disallowed, so no query-string pages), and the 2012 terms have no scraping clause (https://www.myjobmag.com/terms). Confirm feed use in writing before live use.
- **SerpApi:** search data is retained 31 days. The "U.S. Legal Shield" isn't on the lower plans. Google v. SerpApi (filed 19 Dec 2025) is ongoing (https://serpapi.com/legal; https://blog.google/technology/safety-security/serpapi-lawsuit/).
- **Resend:** its AUP forbids cold outreach, purchased lists and scraped contacts, and requires a complaint rate under 0.08% and a bounce rate under 4% (https://resend.com/legal/acceptable-use). Transactional only.
- **Anthropic:** the usage policy forbids generating or distributing spam (https://www.anthropic.com/legal/aup). Outreach stays targeted, cited, low-volume and human-reviewed.
- **Google Workspace, Gmail and Microsoft 365:** the policies prohibit unsolicited *mass* email and using multiple accounts to get around limits (https://workspace.google.com/terms/use_policy/, https://developers.google.com/gmail/api/policy). Our posture is low-volume, personalised, lawful 1:1 B2B mail, with no warm-up pools (ADR-016).
- **Gmail restricted scopes:** `gmail.readonly` needs verification plus a security assessment for public apps. **Internal** apps in our own Workspace organisation are exempt (https://support.google.com/cloud/answer/13464323). This is why a dedicated outreach tenant holds the mailboxes.
- **Sender requirements:** Gmail and Yahoo require SPF or DKIM, PTR, TLS and a spam rate under 0.3% for all senders. Bulk senders (about 5,000/day to personal Gmail) also need SPF+DKIM, aligned DMARC and RFC 8058 one-click unsubscribe (https://support.google.com/a/answer/81126, https://senders.yahooinc.com/best-practices/). Outlook.com has enforced the same for senders above 5,000/day since 5 May 2025. We meet them all at any volume (INV-4).
- **Legal regimes:** see ADR-034 (Nigeria GAID 2025, UK PECR, EU country rules, US CAN-SPAM). Not legal advice. The Phase 20/21 launch gates require qualified review.

---

## 3. Provider IDs, credential keys and env names

**Provider IDs** are the keys of the credentials vault (`IntegrationCredential.provider`) and of the daily usage counters (`ProviderUsage.provider`). **Adapter IDs** name the code that uses a provider. Several adapters can share one provider key.

| Provider ID (vault key, usage counter) | Env fallback | Adapters that use it | Notes |
|---|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | `src/platform/ai` provider `anthropic` | Set an Anthropic console spend limit too |
| `google-places` | `GOOGLE_PLACES_API_KEY` | `google-places` | Restrict the key to the Places API (New) |
| `pagespeed` | `PAGESPEED_API_KEY` | `audit.web` (PageSpeed checks) | |
| `youtube-data` | `YOUTUBE_API_KEY` | `youtube-channels`, `audit.video` | `search.list` has its own 100/day bucket |
| `serpapi` | `SERPAPI_API_KEY` | `jobs-serpapi` | |
| `adzuna` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | `jobs-adzuna` | Only with a licence (disabled by default) |
| `hunter` | `HUNTER_API_KEY` | `hunter` (email finder and verifier) | |
| `companies-house` | `COMPANIES_HOUSE_API_KEY` | `companies-house` (legal form) | |
| `resend` | `RESEND_API_KEY` | platform `EmailSender` `resend` | Transactional only |
| `cal-com` | `CALCOM_API_KEY`, `CALCOM_WEBHOOK_SECRET` | `cal-com` | |
| `outreach-mailbox:<mailboxId>` | client only: `GOOGLE_WORKSPACE_OAUTH_CLIENT_ID/SECRET` | `gmail-api`, `smtp` (sender); `gmail-api`, `imap` (inbound) | One entry per mailbox; refresh tokens or SMTP secrets live only in the vault |
| `browser` (usage counter only) | `BROWSER_RUNTIME`, `VERCEL_SANDBOX_SNAPSHOT_ID`, `BROWSER_FALLBACK_URL`, `BROWSER_FALLBACK_SIGNING_KEY` | `vercel-sandbox`, `serverless-chromium` | Sandbox authenticates with Vercel OIDC, so no vault entry is needed |
| (none) | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry SDK | Env only |

The full env list, with comments, is in `.env.example`. Settings (non-secret configuration such as `platform.crawlerContactUrl` or per-domain DKIM selectors) live in the settings store or the database, not in env.

---

## 4. Go-live order (Phase 21)

1. Anthropic
2. Google Places, SerpApi, YouTube and the App Store (plus MyJobMag once confirmed)
3. Hunter and Companies House
4. PageSpeed and the browser runtime
5. Resend
6. Cal.com
7. Outreach mailboxes and inbound, sending only to internal test addresses until every launch gate passes

Adzuna appears in Phase 21's prompt but stays **off** unless FUTUREUNI holds a licence (module spec OQ-11). Jobberman stays off.

---

## 5. MCP servers (build time only)

`.mcp.json` configures the MCP servers Claude Code uses **while building**. They're never used at runtime.
- Claude Code asks you to approve each project server the first time. Reset the choices with `claude mcp reset-project-choices`.
- Environment variables are read from the shell that launches Claude Code, not from `.env` files. On Windows, use `setx NAME "value"` and then open a new terminal.
- Bare `npx` works on this Windows machine. If a server fails with `spawn npx ENOENT`, change that entry to `"command": "cmd", "args": ["/c", "npx", …]`.
- Source: https://code.claude.com/docs/en/mcp.

| Server | Config | What it's for | Phases | What you must do by hand |
|---|---|---|---|---|
| **Prisma** | stdio `npx -y prisma@7 mcp` (Prisma CLI's built-in server: `migrate-status`, `migrate-dev`, `Prisma-Studio`) | Migration status and migration help against the **local** database | 2, and any phase with a schema request at merge | Nothing. Run it from the repo so it finds `prisma.config.ts`. It's pinned to 7 because `prisma@latest` is the 8.0 RC. Keep tool approval on: `migrate-dev` can reset a drifted local database. The remote Prisma MCP only manages Prisma Postgres, so it isn't used |
| **Playwright** | stdio `npx -y @playwright/mcp@0.0.82 --isolated --browser msedge --output-dir .playwright-mcp` | Opens the running app to check UI visually at 375–1440px, in light and dark | 3, 4, 12, 15–18, 19–21 | Nothing. Edge ships with Windows 11; change `--browser` to `chrome` if preferred. Output goes to the gitignored `.playwright-mcp/` |
| **Context7** | http `https://mcp.context7.com/mcp` | Current docs for Next.js, Prisma, Vercel Workflow, Better Auth, Tailwind, Motion, Zod and others | Every phase | Optional: create a key at context7.com/dashboard, then add `"headers": {"Authorization": "Bearer ${CONTEXT7_API_KEY}"}` for higher limits. Without it the anonymous tier is used. You also have Context7 at user scope; the project entry takes precedence in this repo |
| **GitHub** (official remote) | http `https://api.githubcopilot.com/mcp/` with `Authorization: Bearer ${GITHUB_MCP_PAT}`, toolsets repos, issues, pull_requests, actions | Issues, PRs and branches, once the repo is on GitHub | 1 (CI), 19–21 | Create a **fine-grained PAT** scoped to this repository, then `setx GITHUB_MCP_PAT "github_pat_…"`. Not needed until the repo is pushed |
| **Vercel** (official remote, beta) | http `https://mcp.vercel.com` (OAuth) | Deployments, logs, env and project settings | 21 (and debugging previews) | Run `/mcp` in Claude Code, choose `vercel` and sign in. The Vercel plugin already installed here exposes the same server; if tools appear twice, remove one entry |
| **Neon** (official remote) | http `https://mcp.neon.tech/mcp` (OAuth or API key) | Database branches for previews, and restore drills | 21 (optional earlier) | Run `/mcp`, choose `neon` and sign in. For safety, untick "Allow writes" or use `?readonly=true&projectId=<id>` day to day. The local `@neondatabase/mcp-server-neon` package is deprecated |

Sources: https://github.com/microsoft/playwright-mcp, https://github.com/upstash/context7, https://github.com/github/github-mcp-server, https://vercel.com/docs/agent-resources/vercel-mcp, https://github.com/neondatabase/mcp-server-neon, and the `prisma --help` output for 7.10.0.

---

## 6. Still to verify (owner: the phase named, before relying on it)

| Item | Phase |
|---|---|
| PageSpeed default quota, in the Cloud console | 10 |
| Neon Free project count (100 or 20) and the current plan names on the Vercel Marketplace | 21 |
| Hunter verification credit cost; Apollo API access by plan (only if switching) | 9 |
| Whether each SerpApi Google Jobs page counts as one search; the lawsuit's status | 8 |
| MyJobMag feed licence (written confirmation) | 8 |
| Apple reviews RSS availability and terms | 8, 10 |
| Workspace NGN price; Instantly and Smartlead only if ADR-016 is revisited | 21 |
| Gmail keeps our `List-Unsubscribe` headers and DKIM covers them; `Message-ID` read-back | 12 |
| Cal.com Free-plan webhooks and API; `metadata[leadRef]` reaching webhooks | 14 |
| Sentry integrations on the Developer plan; Team monthly price | 21 |
| Domain-wide delegation across separate Workspace tenants, and signing through Vercel OIDC + WIF | 12, 21 |
