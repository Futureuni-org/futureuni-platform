# tests/factories/

**Owner: Phase 02 (Core schema and registry).** Test data for every Prisma model. Tests state only
the fields their assertions depend on; the factories fill in the rest with valid values.

```ts
import { createLeadWithAudit, withRollback } from "../../tests/factories"; // relative until CR adds @/tests

it("moves an audited lead to SCORED", () =>
  withRollback(async (tx) => {
    const { lead } = await createLeadWithAudit(tx, { serviceLine: "VIDEO_EDITING", market: "INTERNATIONAL" });
    // …act and assert with `tx`…
  }));
```

## Rules

- **`withRollback(fn)`** runs `fn` in one transaction and always rolls it back, so a test leaves
  nothing behind and test files can run in parallel. Use it for every test that writes.
- **`assertTestDatabase()`** refuses any database that isn't a local `futureuni_test*`.
  `withRollback` calls it first.
- **`build<Model>(overrides)`** returns a plain `Prisma.<Model>UncheckedCreateInput` without
  touching the database. Required parent ids are part of its argument type.
- **`create<Model>(tx, overrides)`** inserts one row and returns it, creating any required parent
  (user, company, lead, audit…) you didn't pass.
- Values that must be unique (`uniqueToken`, `uniqueEmail`, `uniqueDomain`, `uniqueInt`) carry a
  per-process random part, so parallel test files never wait on each other's uncommitted rows.
- Other text uses `faker`, seeded with `20260925`.
- `createReply({ leadId: null })` and `createMeeting({ leadId: null })` make UNMATCHED rows.
- Time: `FIXED_NOW` (2026-10-03 09:00 UTC), `fixedClock` (`{ now }` for services that take a
  clock) and `daysAgo(n)`.

## Composites

| Function | Creates |
|---|---|
| `createTeamMember(tx, { role, serviceLines, … })` | A user with a team profile |
| `createLeadInStatus(tx, status, overrides)` | A lead already in `status`, with the fields that status implies (score from SCORED on, `nurtureReason`, `disqualifyReason`, `closedAt`, `firstContactedAt`). No event trail: use it to test what happens next |
| `createLeadWithAudit(tx, { serviceLine, market, status })` | A lead (default AUDITED) with one completed audit, a check run and a pitchable finding |
| `buildValidProfile(line)` | A `ServiceLineProfile` that passes the contract (a copy of the seeded placeholder) |
| `upsertLineCapacityState(tx, { serviceLine, mode })` | The line's single capacity row |

## Every factory

| File | Factories |
|---|---|
| `core.ts` | User, TeamProfile (`createTeamMember`), Session, Account, Verification, TwoFactor, RateLimit, Invite, AuditLog, Notification, NotificationPreference, EmailDelivery, Setting, IntegrationCredential, AiCall, PromptVersion, JobRun, DomainEvent, WebhookEvent, IdempotencyKey, ProviderUsage, FileObject, SavedView |
| `directory.ts` | Company, CompanySourceRef, Contact, Note |
| `acquisition-leads.ts` | ServiceLineProfileVersion (published, inactive), SavedSearch, SearchRun, Signal, Lead, LeadEvent, Audit, AuditCheckRun, AuditFinding, AuditCacheEntry, ScoreReview, CrossSellGroup, LineCapacityState |
| `acquisition-outreach.ts` | Sequence, SequenceStep, SendingDomain, Mailbox, MailboxDailyStat, MailboxSyncState, Enrollment, Message, MessageCitation, MessageAttachment, TrackingEvent |
| `acquisition-inbox.ts` | Reply, ReplyCorrection, InboxThread, Suppression, ConsentRecord, DataSubjectRequest |
| `acquisition-pipeline.ts` | Meeting, Proposal, ProposalLineItem, Deal, Handoff, HandoffAssignment |

Each has `create<Model>`; most also have `build<Model>`. Defaults respect the database rules
(the CHECK constraints and partial unique indexes in the init migration): for example
`createEnrollment` puts each enrolment on its own new company (INV-9), `createProfileVersion`
publishes an inactive version, and money is in minor units.

The development seed (`prisma/seed/`) is separate: it writes one fixed, curated dataset with
deterministic ids, while factories make fresh rows for each test.
