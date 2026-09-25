# Wave 3: Prep and Merge Guide

Wave 3 turns audited leads into conversations and revenue. Four phases run in parallel:

- **11** Scoring, qualification, briefs, cross-sell and capacity throttling
- **12** Outreach engine
- **13** Reply inbox
- **14** Pipeline, meetings, proposals and won/lost

Wave 2 must be merged, and its integration (Part C3 of `wave-2-prep-and-merge.md`) must have passed.

---

## Part A: Before starting Wave 3 (on `main`)

### A1. Ownership map additions

On `main`, say to Claude Code:

> "Apply Part A1 and A2 of docs/prompts/wave-3-prep-and-merge.md, then run the ownership duplicate check and pnpm check."

| Phase | Add to `owns` |
|---|---|
| 11 | `src/modules/acquisition/scoring/**`, `src/modules/acquisition/crosssell/**`, `runtime-skills/acquisition/score-*/**`, `evals/acquisition/score-*/**` |
| 12 | `src/modules/acquisition/outreach/**`, `runtime-skills/acquisition/outreach-*/**`, `evals/acquisition/outreach-*/**`, `src/app/(public)/**`, `src/app/api/unsubscribe/**`, `src/app/api/webhooks/outbound/**` |
| 13 | `src/modules/acquisition/inbox/**`, `runtime-skills/acquisition/inbox-*/**`, `evals/acquisition/inbox-*/**`, `src/app/api/webhooks/inbound/**` |
| 14 | `src/modules/acquisition/pipeline/**`, `runtime-skills/acquisition/pipeline-*/**`, `evals/acquisition/pipeline-*/**`, `src/app/api/webhooks/calendar/**` |

### A2. Public paths in the auth middleware

In the Phase 3 middleware/proxy file, allow these paths without a session:

- `/u/*` (the unsubscribe page)
- `/api/unsubscribe/*` (RFC 8058 one-click)
- `/api/webhooks/*`

Each handler protects itself: unsubscribe tokens are signed, and webhooks verify their signatures.

### A3. Prompts and terminals

Copy `phase-11-scoring.md`, `phase-12-outreach.md`, `phase-13-inbox.md`, `phase-14-pipeline.md` and this file into `docs/prompts/`, then commit. Then:

```bash
pnpm phase start 11 scoring
pnpm phase start 12 outreach
pnpm phase start 13 inbox
pnpm phase start 14 pipeline
```

In each worktree, open Claude Code at maximum effort and in plan mode, then say:

> "Read docs/prompts/phase-NN-….md and execute it. Plan first."

---

## Part B: Shared agreements for Wave 3

### B1. Lead lifecycle ownership

All transitions go through `transitionLead()`. If a transition you need isn't in the allowed-transitions table in `@/modules/acquisition/core`, **raise a request.** Don't work around it.

| Transition | Owner |
|---|---|
| `AUDITED → SCORED`; `AUDITED → DISQUALIFIED` (low score or no channel); `AUDITED/SCORED → NURTURE` (reason `capacity`); `NURTURE(capacity) → SCORED` (capacity freed) | **11** |
| `SCORED → IN_REVIEW → APPROVED → CONTACTED`; `IN_REVIEW → SCORED` (rejected draft, regenerate); `IN_REVIEW → DISQUALIFIED` (reviewer says bad lead) | **12** |
| `CONTACTED → REPLIED`; `CONTACTED/REPLIED → NURTURE` (not now); `→ SUPPRESSED`, through Phase 9's `addSuppression` | **13** |
| `REPLIED → MEETING_BOOKED → PROPOSAL_SENT → WON / LOST`; any active status `→ LOST` (manual, with a reason); `NURTURE → REPLIED` (re-engaged) | **14** |

### B2. Seams (fixed signatures)

Consumers put stand-ins in `<their folder>/_seams.ts` with `// SEAM:<ID>` markers. Providers implement the **exact** signature.

```ts
// ---- Provided by Phase 11 (scoring / crosssell) ----
// SEAM-LEAD-BRIEF        consumers: 12, 14   stand-in: read Lead.brief + Lead.scoreReasons
export async function getLeadBrief(leadId: string): Promise<{ brief: string | null; keyFindingIds: string[]; suggestedAngleId: string | null; score: number | null; scoreReasons: Array<{ ruleId: string; points: number; label: string }> }>;

// SEAM-THROTTLE          consumer: 12        stand-in: always { mode: "NORMAL", newFirstTouchesToday: Infinity }
export async function getOutreachThrottle(line: ServiceLine): Promise<{ mode: "NORMAL" | "SLOW" | "PAUSED"; newFirstTouchesToday: number; reason: string }>;

// SEAM-CROSSSELL         consumer: 12        stand-in: read CrossSellGroup rows
export async function getCrossSellContext(leadId: string): Promise<{ groupId: string | null; isLeading: boolean; leadingLeadId: string | null; lines: ServiceLine[] }>;

// ---- Provided by Phase 12 (outreach) ----
// SEAM-STOP-SEQUENCE     consumers: 13, 14   stand-in: update Enrollment rows to STOPPED directly
export async function stopEnrollments(tx: Tx | null, scope: { leadId?: string; contactId?: string; companyId?: string }, reason: "REPLY" | "UNSUBSCRIBE" | "BOUNCE" | "MEETING_BOOKED" | "WON" | "LOST" | "MANUAL" | "SUPPRESSED"): Promise<{ stopped: number }>;

// SEAM-PAUSE-SEQUENCE    consumer: 13        stand-in: set Enrollment.status=PAUSED, nextRunAt=until
export async function pauseEnrollment(tx: Tx | null, leadId: string, until: Date, reason: "OUT_OF_OFFICE" | "NOT_NOW" | "MANUAL"): Promise<void>;

// SEAM-PROPOSE-ENROLLMENT consumer: 13       stand-in: log + create a Note on the lead
export async function proposeEnrollment(actor: Actor, input: { leadId: string; contactId: string; reason: "REFERRAL" | "RE_ENGAGE" }): Promise<{ draftMessageId: string | null }>;

// SEAM-SEND-ONEOFF       consumers: 13, 14   stand-in: write a Message row with status SENT_MOCK and log
export async function sendOneOffEmail(actor: Actor, input: { leadId: string; contactId: string; subject: string; body: string; inReplyToMessageId?: string; attachments?: Array<{ fileKey: string; filename: string }>; humanConfirmedClaims: boolean }): Promise<{ messageId: string }>;

// SEAM-RECORD-BOUNCE     consumer: 13        stand-in: add EMAIL suppression via Phase 9 + stop enrolments
export async function recordBounce(tx: Tx | null, input: { messageId?: string; providerMessageId?: string; email: string; kind: "HARD" | "SOFT"; detail: string }): Promise<void>;

// SEAM-MAILBOXES         consumer: 13        stand-in: read active Mailbox rows directly
export async function listActiveMailboxes(): Promise<Array<{ id: string; address: string; provider: string; credentialProvider: string }>>;

// ---- Provided by Phase 14 (pipeline) ----
// SEAM-BOOKING-LINK      consumers: 12, 13   stand-in: return settings "acquisition.defaultBookingUrl" + "?lead=<id>"
export async function getBookingLink(leadId: string, ownerId?: string): Promise<string>;
```

### B3. Registration exports

As in Wave 2, each phase **exports** its jobs, settings, AI tasks, schedules, notification types and permissions from its own folder (`jobs.ts`, `settings.ts`, `tasks.ts`, `schedules.ts`, `notifications.ts`) and lists them in `REQUESTS.md`. The integration session registers them in the acquisition manifest.

### B4. Time

Every time-dependent service (send windows, sequence ticks, SLAs, reminders) takes an injectable `now()` through its context, so tests can control time. Don't call `Date.now()` directly in business logic.

---

## Part C: After all four phases finish

### C1. Check each phase

Run `pnpm phase finish <nn>` in each worktree.

### C2. Merge in this order

Merge **11 → 12 → 14 → 13**, running `pnpm install`, `registry:gen`, `db:migrate` (if needed) and `pnpm check` after each one.

### C3. The Wave 3 integration session

On `main`, say:

> "Read docs/prompts/wave-3-prep-and-merge.md Part C3 and do it."

The session must:

1. Read `phases/11..14/SUMMARY.md` and `REQUESTS.md`.
2. **Connect all ten seams.** Delete the stand-ins, and confirm `grep -r "SEAM:" src` returns nothing.
3. Register every Wave 3 job, schedule, setting, AI task, notification type and permission in the acquisition manifest, then run `registry:gen`.
4. Apply the remaining requests: missing lead transitions in core, contract and schema changes as a new migration, and doc updates. List any rejected requests with reasons.
5. **Write and run `tests/integration/wave-3-flow.test.ts`** in mock mode, with a controlled clock, **for every service line in both markets:**
   - an `AUDITED` lead is scored, briefed and moved to `SCORED`
   - a draft is created and moved to `IN_REVIEW`, citing only real findings
   - an approval sends it inside the recipient's send window, from a mailbox within its cap, with an unsubscribe link and the postal address; the lead becomes `CONTACTED`
   - an `INTERESTED` reply is matched to the message, stops the sequence, becomes `REPLIED`, and notifies the owner
   - a booking webhook gives `MEETING_BOOKED`, a pre-call brief is generated, then a proposal is generated, priced deterministically and sent, giving `PROPOSAL_SENT`, then `WON`, then a handoff is created and the owner's load increases
6. **Also test these branches:**
   - `NOT_NOW` with a date gives `NURTURE` with `nextActionAt` set
   - `UNSUBSCRIBE` gives a suppression, all enrolments for the company stopped, and no further sends
   - `WRONG_PERSON` creates a referral contact and a proposed draft
   - `OUT_OF_OFFICE` pauses until the return date
   - a hard bounce gives a suppression and a stop
   - a UK sole trader can't be emailed
   - the Nigeria first step prepares a WhatsApp link, and marking it sent logs it
   - a line at capacity sends new qualified leads to `NURTURE`
   - a cross-sell company has only one active thread
   - the one-click unsubscribe endpoint works without a session
7. Run `pnpm check`, then `saas-review` on the integration diff.
8. Write `phases/wave-3-integration/SUMMARY.md`.

**When C3 passes, the whole engine works end to end without screens, and Wave 4 (Phases 15–18) can start.**
