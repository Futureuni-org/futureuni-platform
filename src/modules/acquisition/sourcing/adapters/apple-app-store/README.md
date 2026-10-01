# `apple-app-store` adapter

Finds apps in the target categories (UI/UX line) and detects usability problems from their public
App Store data.

- **Provider:** Apple iTunes Search API + App Store customer-reviews RSS. No API key.
- **Markets:** both. **Service line:** UI/UX Design.
- **Signals emitted:** `app_low_rating` (rating < 3.5 with ≥ 20 ratings), `app_reviews_usability_complaints`
  (3+ of the latest reviews mention confusing navigation, signup/login trouble, or crashes on key flows).
  These IDs supersede the Phase 8 prompt's `low_rating` / `usability_complaints_candidate`
  (source-adapter.md rule 14).
- **`sourceUrl`:** the app's App Store page. **`externalRef`:** the numeric `trackId`.

## Endpoints

- Search: `https://itunes.apple.com/search?term=<category>&country=<cc>&media=software&limit=<n>`
- Reviews (legacy RSS, JSON variant): `https://itunes.apple.com/<cc>/rss/customerreviews/id=<trackId>/sortBy=mostRecent/json`

## Terms, limits and storage

- Rate: about **20 calls per minute** (iTunes Search API). The adapter declares `perSecond: 0.3`.
- The **customer-reviews RSS feed is legacy and undocumented**, so it is treated as **best-effort**:
  a failed review fetch drops only the reviews signal for that app and never fails the run.
- **App artwork is never stored or displayed** — Apple's terms limit promotional content to promoting
  App Store content, and FUTUREUNI never uses it. We keep the developer website (as the company
  website), the rating, review count and derived usability themes; never a reviewer's name.
- Deep usability analysis of the reviews is Phase 10's job (`acquisition.audit-uiux-review-analysis`);
  this adapter only raises the candidate signal.

## Sources (verified 2026-09-25 in `docs/integrations.md`; re-verified 2026-10-01)

- iTunes Search API: https://performance-partners.apple.com/search-api
- Cross-check the current rate limit and reviews-RSS availability before enabling higher volume
  (open question in `docs/integrations.md`).
