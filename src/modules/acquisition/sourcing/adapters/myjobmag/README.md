# myjobmag

Nigerian job posts from **MyJobMag's public XML feeds**. Emits `job_post_<role>` signals through the shared job pipeline.

- **Status:** DISABLED for live runs (built + mocked) · NIGERIA · all four lines · no credential.
- **Why disabled:** the adapter reads **only** the public XML feeds, which `robots.txt` allows; query-string pages are disallowed and never fetched (INV-14). Live use is held until FUTUREUNI confirms feed use in writing with MyJobMag (services@myjobmag.com). The 2012 terms have no anti-scraping clause.
- **Feeds:** `https://www.myjobmag.com/jobsxml.xml` (and `aggregate_feed.xml`), parsed with `fast-xml-parser`, fetched through `safeFetch` (robots-checked). Feed TTL ≈ 10 minutes.
- **Fields used:** entry `title, link/url/guid, company/employer, description/summary, pubDate/published`.
- **Cost / limits:** free public feeds; one feed fetch per run. `costPerCallMicros = 0`.
- **Docs:** https://www.myjobmag.com/feeds/ · **Terms:** https://www.myjobmag.com/terms
- **Re-verified:** 2026-10-01 (baseline `docs/integrations.md`, researched 2026-09-25).
