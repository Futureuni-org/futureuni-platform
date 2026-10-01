# jobs-serpapi

Google Jobs engine via **SerpAPI**. Emits `job_post_web_developer`, `job_post_product_designer`, `job_post_graphic_designer`, `job_post_video_editor` (the shared job pipeline classifies out recruitment agencies and full in-house teams).

- **Status:** ENABLED · both markets · all four lines · credential `serpapi`.
- **Endpoint:** `GET https://serpapi.com/search.json?engine=google_jobs&q=<title>&location=<text>&api_key=…` (optional `chips=date_posted:month`).
- **Fields used:** `jobs_results[].job_id, title, company_name, location, description, detected_extensions.posted_at, share_link, apply_options[].link, related_links[]`.
- **Cost:** ~$25 / 1,000 successful searches (Starter). One call per job title per location. `costPerCallMicros = 25000`.
- **Limits:** Starter 1,000/month; retries on 429/5xx with backoff (shared `fetchJson`).
- **Terms / robots:** official API (no scraping). Search data retained 31 days. **Supply risk:** Google v. SerpApi (filed 19 Dec 2025) is ongoing — kept behind this adapter so another jobs provider can replace it.
- **Docs:** https://serpapi.com/google-jobs-api · **Terms:** https://serpapi.com/legal
- **Re-verified:** 2026-10-01 (baseline `docs/integrations.md`, researched 2026-09-25).
