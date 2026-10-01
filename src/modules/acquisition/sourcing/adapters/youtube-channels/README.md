# `youtube-channels` adapter

YouTube Data API v3. Finds channels by niche keyword and `regionCode`, for the **Video Editing**
line. Emits `active_creator` and `gone_quiet` (source-adapter.md §3a).

- **Provider / credential:** `youtube-data` (`YOUTUBE_API_KEY`), shared with `audit.video`.
- **Status:** ENABLED, both markets.
- **Docs:** search.list <https://developers.google.com/youtube/v3/docs/search/list>,
  channels.list <https://developers.google.com/youtube/v3/docs/channels/list>,
  playlistItems.list <https://developers.google.com/youtube/v3/docs/playlistItems/list>.
- **Terms:** YouTube API Services Developer Policies
  <https://developers.google.com/youtube/terms/developer-policies>.

## Calls and fields

1. `search.list` (`type=channel`, `q`, `regionCode`, `maxResults`) → candidate channel ids.
2. `channels.list` (`part=snippet,statistics,contentDetails`) → title, `subscriberCount`,
   `videoCount`, uploads playlist id.
3. `playlistItems.list` (`maxResults=1`) on the uploads playlist → latest upload date.

Only derived facts are stored on the signal (`subscribers`, `lastUploadAt`, `daysSinceUpload`);
`externalRef` is the channel id and `sourceUrl` is `https://www.youtube.com/channel/<id>`.

## Quota, cost and limits

- `search.list` costs **100 units** and has a **separate 100-calls/day** bucket — the binding daily
  cap. Each `search.list` charges `ctx.budget`, so the per-day quota snapshot in `RunBudget` limits
  it (`rateLimit.perDay = 100`). `channels.list` and `playlistItems.list` are 1 unit each of the
  general 10,000/day bucket.
- `costPerCallMicros = 0` (free quota); the pressure is the daily call cap, not dollars.
- Cache per query per day to stay inside the quota (follow-up; see Known limitations).

## Storage (INV-14)

Public, non-authorised YouTube data may be kept for **at most 30 days**, then refreshed or deleted.
Signals carry `observedAt`; a refresh job (future) re-fetches or drops stale YouTube evidence.

## Known limitations

- Per-query/day caching is not yet implemented here; until it is, re-running the same niche the
  same day spends the `search.list` quota again.
- `active_creator` uses the subscriber band plus the latest upload date; it does not compute a full
  cadence profile (that is `audit.video` / `video.cadence` in Phase 10).

Re-verified: 2026-10-01 (figures cross-checked against `docs/integrations.md`, researched 2026-09-25).
