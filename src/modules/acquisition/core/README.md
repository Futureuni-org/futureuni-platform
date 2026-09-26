# src/modules/acquisition/core/

**Owner: Phase 02 (Core schema and registry).** The acquisition rules every phase shares, imported
from `@/modules/acquisition/core`.

| Export | What |
|---|---|
| `transitionLead(tx, { leadId, to, actor, reason?, meta?, nurtureReason?, clock? })` | The only way a lead's status changes. Checks the move against `LEAD_TRANSITIONS`, updates the lead only if its status hasn't changed meanwhile (else CONFLICT), sets the side fields (`closedAt`, `firstContactedAt`, `nurtureReason`, `disqualifyReason`, `lastActivityAt`) and writes the `LeadEvent` in the same transaction (INV-1, INV-15). Moving to the current status is a no-op |
| `recordLeadCreation(tx, …)` | The `— → NEW` event for a new lead |
| `canTransition(from, to, { nurtureReason })`, `LEAD_TRANSITIONS` | The lifecycle table (module spec §5.2). NURTURE → SCORED only for a CAPACITY or COMPLIANCE hold |
| `LEAD_CLOSED_STATUSES`, `LEAD_TERMINAL_STATUSES`, `LEAD_PRE_CONTACT_STATUSES`, `LEAD_ACTIVE_STATUSES`, `isOpenLeadStatus` | Status groups |
| `leadEventActor(actor)` | The event's actor columns (a job's name for SYSTEM actors) |
| `findSuppressions(tx, { email, phone, domain })`, `isSuppressed`, `assertNotSuppressed` | The suppression check (INV-2): normalised values, the email's own domain, and the keyed hash of each value |
| `hashSuppressionValue(normalized)`, `normalizeSuppressionValue(type, raw)` | How suppressions store values; Phase 9 writes data-subject deletions with the same hash |

Errors: NOT_FOUND, INVALID_TRANSITION (details `from`, `to`), VALIDATION_FAILED (a missing
nurture or disqualify reason), CONFLICT and SUPPRESSED (details `types`).
