# google-places adapter

Google Places API (New) **Text Search**, for the Web Development and Graphic Design lines.

- **Signals:** `no_website` (no own website field, or only a social/marketplace link),
  `ecommerce_on_social_only` (Nigeria; a social-only presence for a business that sells),
  `new_business` (few reviews — a weak signal).
- **Credential:** `google-places` (`GOOGLE_PLACES_API_KEY`), resolved through `resolveProviderKey`.
- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchText` with an `X-Goog-FieldMask`.

## Fields used (minimal mask)

`places.id`, `places.displayName`, `places.formattedAddress`, `places.addressComponents`,
`places.websiteUri`, `places.nationalPhoneNumber`, `places.userRatingCount`,
`places.primaryTypeDisplayName`. Requesting `websiteUri`/`nationalPhoneNumber` puts the request on
the **Enterprise** SKU, so the field mask stays minimal and cost is estimated per run.

## Terms and storage (INV-14)

- Maps Platform terms allow storing the **`place_id` indefinitely** (kept in `CompanySourceRef`) and
  coordinates for 30 days; they **forbid** copying or saving business names, addresses or reviews,
  and forbid using Places data in a listings/directory service.
- So this adapter sets `externalRef` (the `place_id`), carries **no** `rawPayload`, and keeps
  `evidence` to facts we derive (`websiteKind`, `reviewCountUnder10`/`reviewCount`) — never Places
  content. The directory stores a Places-only company under a placeholder name and persists only our
  own facts (the search location, timezone, our industry label); display fields are fetched live by
  `place_id`.
- Arbitrary page fetches (not used here) would go through `@/platform/http` (`safeFetch`, robots).

## Cost and limits

- `costPerCallMicros`: ~35,000 µUSD ($35 / 1,000 Text Search calls, Enterprise with website+phone).
- `rateLimit`: 10/s, no hard daily cap (cost-capped per run and per day via settings + `ProviderUsage`).

## Sources (re-verified 2026-10-01)

- Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Data fields / SKUs: https://developers.google.com/maps/documentation/places/web-service/data-fields
- Platform terms: https://cloud.google.com/maps-platform/terms (§3.2.3) and the Maps service terms.
