# jobberman

Nigerian job board **Jobberman**. Would emit `job_post_<role>` signals, but there is **no compliant way to access it**, so it is DISABLED and has no live implementation.

- **Status:** DISABLED (no fetch; `search` yields nothing) · NIGERIA · all four lines · no credential.
- **Why disabled (INV-14):** no public API; terms **clause 22** bans robots and scraping without written approval; `robots.txt` disallows `/job/` and query pages. No feed is offered.
- **Alternative:** `jobs-serpapi` with Nigerian locations indexes much of the same inventory.
- **Enable only** with a written data partnership / API access from Jobberman.
- **Mock:** provides a small Nigerian fixture set for tests only.
- **Docs / Terms:** https://www.jobberman.com/terms · robots: https://www.jobberman.com/robots.txt
- **Re-verified:** 2026-10-01 (baseline `docs/integrations.md`, researched 2026-09-25).
