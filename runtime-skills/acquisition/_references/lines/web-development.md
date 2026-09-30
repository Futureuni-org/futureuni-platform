<!-- version: 1 · last reviewed: 2026-09-29 -->

# Line: Web Development

## What "good" looks like

- **Performance** — mobile LCP under 2.5 s on 3G-Fast; TBT under 200 ms; CLS under 0.1.
- **Security** — valid TLS certificate, no mixed content.
- **Mobile** — a `<meta viewport>` tag, layout that works at 375 px with no horizontal
  scroll.
- **SEO basics** — unique `<title>` per page, meta descriptions, one `<h1>` per page,
  robots.txt controls where needed.
- **Accessibility (AA)** — alt text on informative images, labelled form controls,
  keyboard-focusable interactive elements, colour-contrast for text ≥ 4.5:1.
- **Trust markers** — real contact path, real address if physical, an unsubscribe link
  on transactional email (INV-4).

## Common problems and how to recognise them from evidence

| Problem | Evidence you'll see |
|---|---|
| No real website | Google Places listing has no `website` field, or resolves to a social page. |
| Slow on mobile | PageSpeed mobile LCP > 4 s or performance score < 50. |
| Not mobile friendly | No viewport meta, or layout overflows at 375 px. |
| No TLS / mixed content | TLS handshake fails or Chrome flags the padlock. |
| Outdated stack | Footer copyright < current year − 2, or legacy platform strings. |
| Broken pages | Broken-links checker reports ≥ 3 dead links. |
| Weak SEO basics | Missing titles, meta descriptions or H1 across the top 3 pages. |
| DM-first commerce | Instagram/Facebook link and no checkout page on Places. |

## Business impact in plain language

- **Faster mobile pages keep visitors from bouncing.** Nigerian mobile data is slow and
  metered; a heavy page costs a real user real money.
- **A secured site sends the signal that you're open for business.** Browsers now warn
  visitors before they see the page.
- **A real site is discoverable.** Search engines don't index Instagram DMs.
- **A checkout page recovers orders you lose to missed DMs.**

## Vocabulary — for non-technical owners

Use: site, storefront, mobile-friendly, secured (TLS), search-friendly, checkout,
loading speed, order form.

Avoid without explanation: LCP, TBT, CLS, viewport, canonical, robots.txt, PageSpeed
Insights, hydration, SPA, CDN, DNS.

## Proof to attach — mapping to portfolio `proofTags`

- Performance findings → tag `performance`.
- DM-to-storefront moves → tag `storefront`.
- Nigerian small-business retainer → tag `small-business`.
- Process / weekly-demo pitch → tag `process`, `retainer`.

Only non-placeholder portfolio items may be attached (INV-19). Placeholders never leave
`resolvePortfolio`.
