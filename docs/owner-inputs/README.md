# Owner inputs: what only Prince can provide

This is the tracker for decisions and facts the build can't invent. The platform runs end to end without them (mock providers, placeholders, conservative defaults), but **real outreach stays blocked until each launch-gate item is done** (Phase 21, `docs/launch-checklist.md`).

| # | Input | Status | Where it's used | Blocks |
|---|---|---|---|---|
| 1 | FUTUREUNI's postal address for outreach email footers | **Waiting**: Prince will send it | Setting `platform.postalAddress` (INV-4; required by CAN-SPAM and PECR practice) | All real outreach sends |
| 2 | Brand files: approve or replace the vector drafts (mark, dark variant, favicon, wordmark lockup) | **Drafts ready** in `docs/brand/drafts/`; approval needed | Phase 4 shell, emails, proposal PDFs | Nothing technical; Phase 4 uses the PNG until approved |
| 3 | Legal review: Nigerian counsel on GAID 2025 Art. 18 and 26, and a general review of the country rules | **Pack prepared** in `docs/legal/`; needs a qualified lawyer | Setting `acquisition.compliance.ngDirectMarketingBasis`; country rules table (Phase 9); ADR-034 | Nigerian outreach, and any outreach until reviewed or accepted |
| 4 | Real prices per package, line and market | **Worksheet ready**: `pricing-and-portfolio.md` §1 | Profiles (Phase 7), proposals (Phase 14) | Quoting prices to prospects |
| 5 | Real portfolio items | **Worksheet ready**: `pricing-and-portfolio.md` §2 | Outreach proof, proposals "Why FUTUREUNI" | Attaching proof (outreach still works without it) |
| 6 | Outreach domain names and sender identities (2–3 domains, 1–2 real staff senders each) | Not started (Phase 21) | ADR-016 | Real sending |
| 7 | First two admins (default: Prince plus the lead engineer) | Not started | Phase 21 `bootstrap:admin` | Production sign-in |
| 8 | Sectors to exclude (churches, government bodies…) | Default in module spec OQ-6 | Profile disqualifiers | Nothing (default applies) |
| 9 | MCP servers: approve the project servers, then `/mcp` sign-in to Vercel and Neon | **Approved** 2026-09-26 (prisma, neon, github, vercel, in the gitignored `.claude/settings.local.json`). **Waiting**: `/mcp` sign-in to Vercel and Neon, and `GITHUB_MCP_PAT` once the repo is on GitHub | Build-time tooling only | Nothing until Phase 21 (Vercel, Neon) |
| 10 | Local database for development | **Done** 2026-09-26: native PostgreSQL 18 on `localhost:5432`, chosen over Docker Desktop (ADR-004 amendment) | Phase 1 `db:up`/`db:down`, `pnpm phase start`; every phase's tests | Nothing |

When an input arrives, update its row, apply it where the "Where it's used" column says, and note the change in the relevant spec's changelog.
