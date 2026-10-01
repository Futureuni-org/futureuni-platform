# manual adapter

Adds one business a team member found by hand (all lines, both markets).

The adapter entry exists so the registry and Search panel can list it; the real work runs through
the **`addManualLead` service** (`src/modules/acquisition/sourcing/manual.ts`), not a provider
`search`.

## Behaviour

- Input: a company (name required; website, phone, email, city, region, country optional), an
  optional contact, an optional `sourceUrl`, and any profile signals the member asserts.
- The record runs through the same pipeline as a search (dedupe, early suppression, signal,
  `NEW` lead). It always records the reserved `manual_lead` signal.
- **Source** is recorded as `manual:<userId>` (INV-10); `sourceUrl` is optional, so a manual signal
  without one can't be cited in outreach (INV-5).
- The new lead is **owned by the creator** (module spec §2).
- The **market is derived** from the company's country/phone/website.

No credential, no cost. Re-verified 2026-10-01.
