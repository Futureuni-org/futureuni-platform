# src/modules/acquisition/audits/

**Owner: Phase 10 (Audits).** FUTUREUNI's free mini-audit (`docs/contracts/audit-agent.md`). For each
lead, the agent for its service line inspects the prospect's public presence and produces **findings**
— each a precise claim with structured evidence plus a source URL or artifact key (INV-18). Accuracy
beats volume.

## Layout

- `orchestration/run-audits.ts` — `runAudits(leadId, …)`: `ENRICHED → AUDITING → AUDITED` (or rebound
  to `ENRICHED` and flag after N required failures), per-lead cost cap, domain cache, emits
  `audit.completed`.
- `agents/` — `audit.web`, `audit.uiux`, `audit.graphic`, `audit.video` (+ the registry and runner).
- `checks/` — the independent checks (a failure → `CHECK_FAILED`, never a crashed audit).
- `claims/templates.ts` — deterministic claim templates for MEASURED/OBSERVED checks.
- `providers/` — `pagespeed`, `youtube`, `app-store` (real + `mock`, selected by `MOCKS`).
- `ai/` — shared AI-findings path with evidence-reference validation (contract rule 3, INV-24).
- `services.ts` — `getAuditsForLead`, `getFinding`, `rerunAudit`, `dismissFinding` (permission-checked,
  audited; Phase 16 reads these).
- `jobs.ts`, `settings.ts`, `tasks.ts` — manifest inputs (registered by Phase 19).

## Data sources (verified 2026-10; record quota/terms before go-live — integrations.md §6)

- **PageSpeed Insights API v5** — https://developers.google.com/speed/docs/insights/v5/get-started
  (lab data; CrUX field data is being removed from this API). Provider id `pagespeed`.
- **YouTube Data API v3** `channels.list` → `playlistItems.list` → `videos.list`
  (`contentDetails.caption`, `snippet.thumbnails`, `statistics`) —
  https://developers.google.com/youtube/v3/docs/videos/list . 1 unit per list call; `search.list` is
  avoided (separate 100/day quota). Public data kept ≤ 30 days (terms). Provider id `youtube-data`.
- **Apple App Store customer reviews** (legacy RSS, best effort) —
  https://itunes.apple.com/{country}/rss/customerreviews/id={appId}/sortBy=mostRecent/json ;
  https://performance-partners.apple.com/search-api . Provider id `apple-app-store`.
- **Browser runtime** (screenshots, axe, click-through): `@/platform/browser` (ADR-017).

Instagram and TikTok have no compliant public source and are never scraped (INV-14); checks that would
need them record `NOT_ASSESSED`.
