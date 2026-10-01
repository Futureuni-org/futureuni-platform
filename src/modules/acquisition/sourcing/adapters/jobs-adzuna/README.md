# jobs-adzuna

International job posts via the **Adzuna API**. Emits the same `job_post_<role>` signals as `jobs-serpapi` through the shared job pipeline.

- **Status:** DISABLED (built + mocked, never runs) · INTERNATIONAL · all four lines · credential `adzuna` (`{appId, appKey}` JSON).
- **Why disabled:** Adzuna's commercial use beyond a 14-day evaluation trial needs a licence, and its terms state "any attempt to contact a third party … will be considered a breach". Nigeria is not covered. Enable only once FUTUREUNI holds a licence that permits outreach.
- **Endpoint (when enabled):** `GET https://api.adzuna.com/v1/api/jobs/<country>/search/1?app_id=…&app_key=…&what=<title>&where=<loc>&content-type=application/json` (country gb/us/ca).
- **Fields used:** `results[].id, title, company.display_name, location.display_name, description, redirect_url, created`.
- **Limits:** 25/min, 250/day, 2,500/month. `costPerCallMicros = 0` (licensed, no public per-call price).
- **Terms:** permitted uses are publishing listings or personal research; other commercial use is a 14-day trial; contacting advertisers is a breach.
- **Docs:** https://developer.adzuna.com/ · **Terms:** https://developer.adzuna.com/docs/terms_of_service
- **Re-verified:** 2026-10-01 (baseline `docs/integrations.md`, researched 2026-09-25).
