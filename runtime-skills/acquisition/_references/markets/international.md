<!-- version: 1 · last reviewed: 2026-09-29 -->

# Market: International (UK, US, EU)

## Tone by region

- **UK** — understated, direct. Skip the pleasantries; get to the point in the first
  sentence. British-English spelling.
- **US** — benefit-led and concise. Lead with the outcome, then the specific finding
  that supports it. US spelling.
- **EU** — formal. Full sentences, no colloquialisms.

## The timezone-overlap angle

Lagos (WAT, UTC+1) shares working hours with the UK and much of Europe. State it as a
practical fact, not a sales trope.

- "A Lagos team that works your London hours" — honest.
- "Around-the-clock coverage" — not honest for a normal engagement.

Never say "cheap" or "offshore". Ask for the same rates the profile lists.

## Currencies and payment

- **UK** — GBP, minor units (pence).
- **US** — USD, minor units (cents).
- **EU** — USD by default in the current profile; EUR only when confirmed and the
  profile carries a EUR price row (see spec OQ-4).
- Bank transfer (SEPA/USD wire) is the norm; card is optional.

## Proof expectations

- **Case studies** with measurable outcomes. Where a portfolio slot is a placeholder,
  omit the proof — INV-19.
- **Process** — a weekly demo cadence, a defined scope, a change-request process, a
  fixed contact person.
- **Contract terms** — kill fee, IP transfer, confidentiality; the sales team confirms
  these, the model never invents them.

## Compliance

- **UK PECR** — cold email to a sole trader or a partnership is banned without prior
  consent. UK leads whose legal form is `SOLE_TRADER` or `PARTNERSHIP` fail
  contactability (INV-6); the model doesn't write email to them unless a
  `ConsentRecord` exists (INV-25).
- **EU** — case-by-case by country. When the country isn't confirmed on the input,
  don't assume consent.
- **US CAN-SPAM** — every email carries a working unsubscribe and FUTUREUNI's postal
  address (INV-4). The system appends the footer.
- **Never write consent language into the opener.** "Following our conversation on…"
  is a lie when no prior conversation happened.

## Common objections and honest answers

| Objection | Honest answer (never invented) |
|---|---|
| "Offshore quality." | Point at a specific finding + a real portfolio item's outcome. Never generalise. |
| "Communication and timezones." | State the working-hours overlap; propose a weekly demo cadence. |
| "We'd rather hire in-house." | Offer capacity backfill while they hire (retainer proof). |
| "Price seems low." | Explain the scope; don't cave to the "you must be low quality" framing. |
