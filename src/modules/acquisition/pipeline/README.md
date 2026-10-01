# src/modules/acquisition/pipeline/

**Owner: Phase 14 (Pipeline, meetings, proposals).** Takes a warm conversation to a signed client and a clean handoff. No UI — Phases 16/17 build the screens on these services.

## Layout

- `board/` — the stage board (`getPipeline`, per-currency totals), moves (`moveLead`), next actions, manual `nurtureLead`/`reengageLead`, the daily `runStaleCheck`, and lead `notes`.
- `meetings/` — `getBookingLink` (SEAM-BOOKING-LINK, signed `leadRef`), manual meetings, the Cal.com `calendar/` adapter (+ mock) and webhook handler, reminders, and the pre-call brief.
- `proposals/` — deterministic `pricing` (INV-11/INV-17), the `number-check` for AI prose, the proposal lifecycle, and the branded `pdf/`.
- `deals/` — won/lost, the capacity-based handoff (suggested owner, PDF + Markdown) and re-engagement.
- `revenue.ts` — revenue/meeting/conversion aggregates for Phase 17.
- `pipeline.repo.ts` — the only Prisma access. `jobs.ts`/`schedules.ts`/`settings.ts`/`tasks.ts`/`notifications.ts` — manifest inputs (wired by Phase 19). `index.ts` — the public barrel.

## Invariants it upholds

INV-1/INV-15 (every status change via `transitionLead`, then `lead.statusChanged` after commit), INV-3 (stop the company's enrolments on meeting/won/lost), INV-11 (money per currency, never summed), INV-17 (prices computed only in `pricing.ts`; the number-check rejects any other figure), INV-19 (no placeholder portfolio), INV-12/B4 (UTC; injectable `now()`).

## Rules

- Prices come only from `pricing.ts`; the model restates figures. Don't edit the manifest, schema, contracts or core transitions — raise requests in `phases/14/REQUESTS.md`.
- `_seams.ts` holds the stand-ins for the seams Phase 14 consumes; it is deleted at integration.
