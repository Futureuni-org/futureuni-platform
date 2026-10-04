# Phase 16 — change requests

Applied at Wave 4 integration (batch B6). Each entry has an ID, a type and the exact change.

## Seams

### CR-16-SEAM-1 · seam wiring · SEAM-LINE-CONTEXT (stubbed)
Phase 15 provides the real service-line context (`@/modules/acquisition/ui/shell`). It runs in
parallel, so Phase 16 ships the stand-in `src/modules/acquisition/ui/leads/_seams.ts` with
`resolveLine` / `lineHref` / `LINE_SLUGS` (markers `// SEAM:SEAM-LINE-CONTEXT`). `resolveLine` and
`LINE_SLUGS` are byte-identical to Phase 18's copy; `lineHref` is the general section form
(`/acquisition/<slug>/<section>?<query>`) the leads/pipeline/inbox routes need.

**At B6:** repoint every `@/modules/acquisition/ui/leads/_seams` import (across the leads, pipeline
and inbox folders, and the three route folders) to `@/modules/acquisition/ui/shell`, delete
`_seams.ts`, and confirm `grep -r "SEAM:" src` is empty. Mirrors Phase 18's CR-18-SEAM-1.

## Service gaps (interim `*.repo.ts`, to be replaced by real read services)

Every one of these is a read (or, for CR-16-GAP-SET-PRIMARY, one write) the screens need and no
service exposes. Each interim file names its CR in its header comment.

### CR-16-GAP-LEADS-LIST · service gap
`@/modules/acquisition/core` has no UI lead read. Interim files:
- `ui/leads/leads-list.repo.ts` — the filtered, cursor-paginated list, the filter-option sets, the
  strongest-finding excerpt, suppression targets and the CSV export rows.
- `ui/leads/lead-detail.repo.ts` — the detail header (lead, company, owner, contacts, latest
  enrolment), cross-sell siblings, lead events (activity) and signals; plus the small reads the
  actions authorise with (`getLeadScope`, `getLeadScopes`, `isLeadContact`, `getProposalLeadId`,
  `isOnLineTeam`, `getHandoffServices`, `getMessageDelivery`).

Promote a real lead read service (list + detail header + activity) that these screens call.

### CR-16-GAP-PIPELINE-READS · service gap
`@/modules/acquisition/pipeline` exports mutations plus the board read only. Interim
`ui/leads/lead-pipeline.repo.ts` adds: `listLeadMeetings`, `listLeadProposals` (every version, with
line items and the PDF key), `listLeadProposalRefs`, `getLeadDeal` (with its handoff and the
suggested/assigned delivery owners' names). The pipeline repo already has `getProposal`,
`listProposalVersions`, `getDealByLead` and `getHandoffWithDeal`, but none is lead-scoped for display
and none is exported.

**Requested:** export `listLeadMeetings(actor, leadId)`, `listLeadProposals(actor, leadId)` and
`getLeadDeal(actor, leadId)` from the pipeline barrel, each authorising `acquisition.lead.read`.

### CR-16-GAP-QUOTE-PREVIEW · service gap
The quote builder needs a live, server-priced preview. `priceQuoteAction`
(`ui/leads/detail-actions.ts`) runs the exported pure `priceProposal`, but to say whether approval
is needed it has to mirror the rule inside `buildProposal` (discount over the threshold, or a
package priced outside its profile range), and it deep-imports three unexported helpers:
- `getProfileContext` from `@/modules/acquisition/pipeline/profile-context`
- `getDiscountApprovalThresholdBps` and `getTaxSettings` from `@/modules/acquisition/pipeline/settings`

**Requested:** export `previewProposal(actor, leadId, input)` from the pipeline barrel, returning the
priced lines and totals plus `requiresApproval` and `approvalReason` from the same code path that
`createProposal` uses. Then `priceQuoteAction` calls it and the mirrored rule is deleted. Until then
the saved proposal's `requiresApproval` remains the binding answer (the preview is advisory).
Also export `getProfileContext` (the lead-detail loader uses it to list a line's packages).

### CR-16-GAP-FINDING-EVIDENCE · service gap
`getAuditsForLead` returns each finding without its structured `evidence` or `dismissReason`, and
signs only the single `artifactKey`. The Evidence tab shows the measured metrics and the
mobile/desktop screenshots held in `evidence.artifacts[]`, so `ui/leads/lead-pipeline.repo.ts`
(`getFindingExtras`) reads them and `ui/leads/lead-detail-data.ts` signs each artifact key.

**Requested:** add `evidence`, `dismissReason` and signed `artifacts[]` to `FindingView`.

### CR-16-GAP-THREAD-FIELDS · service gap
`@/modules/acquisition/inbox` `getThread` returns messages without `channel` or their citations, and
replies without `followUpDate` or `referral`. The conversation view shows all four, so
`ui/inbox/thread.repo.ts` (`getThreadExtras`) reads them by lead after `getThread` has authorised.

**Requested:** return those fields from `getThread`.

### CR-16-GAP-REGENERATE-DRAFT · service gap
`generateReplyDraft(args, actor)` was written for the reply-processing job: it takes fourteen
ready-made arguments, loads nothing, **authorises nothing**, and stores a new DRAFT each call without
retiring the last one. The composer's "Regenerate" therefore goes through `regenerateDraftAction`
(`ui/inbox/actions.ts`), which authorises `acquisition.inbox.reply` against the lead, reads the
reply and lead (`ui/inbox/inbox.repo.ts`) and assembles the arguments. Old drafts stay in the
database as DRAFT until a reply is sent (which cancels them); the screens hide them from the
conversation and load only the newest into the composer.

**Requested:** export `regenerateReplyDraft(actor, replyId)` from the inbox barrel: authorise, load,
cancel the reply's previous draft, generate. Then delete `inbox.repo.ts` and the assembly.

### CR-16-GAP-CITATION-MARKERS · service gap (defence in depth)
A stored `Message.body` keeps internal citation markers (`[[f:<id>]]`), and `sendReply` /
`sendOneOffEmail` pass the body they are given straight through. Phase 16 strips the markers on the
server (`stripCitationMarkers` in `ui/inbox/thread-data.ts`) before a body is displayed or loaded
into the composer, and shows the cited findings separately, so a marker can't reach a prospect from
these screens.

**Requested:** strip markers in the single send path as well, so no caller can send one.

### CR-16-GAP-INBOX-LIST · service gap (minor)
`ThreadListItem` has no owner name (mapped here from the team list), no snoozed-until (so the
toolbar can snooze but can't show or lift a snooze), and `listThreads` pages by a date cursor while
the screen simply asks for a longer list ("Load more" raises `limit` to the service maximum of 100).
`getUnmatchedReplies` isn't scoped to a line, so every line's inbox shows the same unmatched replies
to those who can link them.

**Requested:** add `ownerName` and `snoozedUntil` to `ThreadListItem`.

### CR-16-GAP-WHATSAPP-DRAFT · service gap (known, from Phase 13)
Phase 13 doesn't produce a WhatsApp-length draft: the suggested response is the email draft. The
composer enforces the 600-character limit itself (the "Copy for WhatsApp" button is disabled, with
the reason, until the text fits), so a person shortens it by hand.

### CR-16-GAP-SET-PRIMARY · service gap (write)
No service sets `Lead.primaryContactId`. `setPrimaryContactAction` authorises
`acquisition.lead.update` against the lead's scope and then calls the guarded repo write
`setPrimaryContact` (`ui/leads/lead-detail.repo.ts`), which only accepts a live contact of the lead's
own company. **It writes no audit entry and no `LeadEvent`.**

**Requested:** a `setPrimaryContact(actor, leadId, contactId)` service in the acquisition core (or
directory) that authorises, audits and records the change; then delete the repo write.

### CR-16-GAP-PIPELINE-TOTALS · service gap (blocks one spec item)
The phase prompt asks for a board header total: "open pipeline value per currency". `getPipeline`
returns a per-currency value for each stage, but nothing returns the value across the open stages,
and this phase may not add money up itself ("money totals come only from the services"). **So the
header shows the count of open leads and "won this month" (from `getRevenueSummary`), and each stage
shows its own per-currency value; the cross-stage open-pipeline value is not shown.**

**Requested:** add `openTotalsByCurrency: MoneyByCurrency` to `PipelineBoard` (the same per-currency
sum `buildColumn` does, over CONTACTED, REPLIED, MEETING_BOOKED and PROPOSAL_SENT). The page then
renders it beside "won this month" with no change to the board component.

### CR-16-GAP-PIPELINE-FILTERS · service gap
The board's "overdue only", "stale only" and "value range" filters are applied in
`ui/pipeline/board-data.ts` to the cards `getPipeline` returns, because `PipelineQuery` takes only
`market`, `ownerId` and a date range. The stage count and value the service returns therefore still
cover the whole stage, so while one of those filters is on the stage header reads "3 of 7" and its
value is the whole stage's.

**Requested:** accept `overdueOnly`, `staleOnly` and a `value` range in `PipelineQuery`, so the
service's counts and per-currency values match what is shown.

### CR-16-GAP-BOOKING-LINK-AUTH · service gap (security hardening)
`getBookingLink(leadId, ownerId?)` does no permission check. Phase 16 never calls it without one:
the lead-detail page calls it only when the viewer has `acquisition.meeting.manage`, and
`boardBookingLinkAction` authorises that permission against the lead's line and owner first.

**Requested:** have `getBookingLink` take an actor and authorise, so no caller can skip the check.

### CR-16-GAP-SAVED-VIEWS · service gap (minor)
Per-user saved views use the platform `SavedView` model directly via `ui/leads/saved-views.repo.ts`
(scope `acquisition.leads:<line>`). No schema change. If a `@/platform/saved-views` service is
introduced, repoint to it.

### CR-16-GAP-BULK-JOBS · service gap
`rescoreLead` and `rerunAudit` do their work inline (scoring may call the AI reviewer; an audit
drives a browser), so up to 200 of them can't run inside one request. The bulk actions
(`ui/leads/actions.ts`) authorise each lead against the matrix, check its status allows the work,
and enqueue one job per lead: `acquisition.scoring.lead`, and `acquisition.audits.lead` with
`force: true` under its own idempotency key (`…:reaudit:<minute>`, because the job's default key is
one per lead for all time and would drop a second audit as a duplicate). The re-audit also writes
the `acquisition.lead.reaudit` audit-log entry that `rerunAudit` writes
(`recordReauditRequested` in `ui/leads/leads-list.repo.ts`).

**Requested:** export `queueRescore(actor, leadIds)` and `queueReaudit(actor, leadIds)` from the
scoring and audits barrels (authorise, audit, enqueue, return per-lead results); then the two
actions call them and the repo write is deleted.

## Found by the phase review

Problems in other phases' code that the Phase 16 review (`saas-review`) found and verified. Phase 16
guards against each one where it can from its own actions; the guard is named with each entry. The
first two need a decision before launch.

### CR-16-PROPOSAL-ATTACHMENT · bug in Phase 12 (outreach) · **Critical**
A sent proposal email carries no PDF. `sendProposal` passes
`attachments: [{ fileKey, filename }]` to `sendOneOffEmail`, which stores `MessageAttachment` rows,
but the single send path (`outreach/email/send.ts`) builds the outbound email without reading them:
the word "attachment" does not appear in that file. The Gmail sender does support attachments
(`sender/gmail-api.ts`). So the prospect receives the covering message and nothing else, while the
proposal is marked `SENT`. **No guard is possible from Phase 16.**

**Requested:** in `send.ts`, load the message's `MessageAttachment` rows (with each file's key and
content type) and pass them as `attachments` on the outbound email. Add a test that a proposal send
reaches the sender adapter with one PDF attachment.


**Fixed on this branch** (with the ownership guard off, at the owner's request); needs the owning phase's review at merge.

### CR-16-STORAGE-PUBLIC · bug in Phase 6 (storage) · **Critical before production**
`getSignedUrl` on the Vercel Blob adapter (`platform/storage/blob.ts`) returns the blob's ordinary
URL with an `exp` query parameter that nothing checks. The URL never expires and needs no session.
Audit screenshots, proposal PDFs and handoff exports are served through it, so anyone who has ever
been given one of those links keeps access to that file. The local adapter used in development is
not affected.

**Requested:** store these purposes as private blobs and return real expiring URLs (or serve them
through an authorising route handler). Until then, treat every proposal PDF link as public.


**Fixed on this branch** (with the ownership guard off, at the owner's request); needs the owning phase's review at merge.

### CR-16-SEND-OUTCOME · service gap in Phases 12 to 14
`sendOneOffEmail`, `sendReply` and `sendProposal` return only `{ messageId }` and discard what the
send path decided (`sent`, `rescheduled`, `blocked`, `skipped`). A caller can't tell an email that
went out from one that was scheduled for the next sending window or blocked by suppression. Phase
16 reads the message's status back after each send (`sendResultFor` in
`ui/leads/action-result.ts`) and the screens say "sent", "scheduled for …" or "not sent".

**Requested:** return the outcome (and the scheduled time) from the three services. Then delete
`getMessageDelivery` and `sendResultFor`. `getThread` should also return a message's
`blockedReason` and `scheduledFor`, so the conversation can say why a message wasn't sent.

### CR-16-LEAD-SUPPRESS · permission matrix · needs a decision
The phase prompt makes "add to suppression" from a lead an admin action, but
`acquisition.suppression.add` is open to every role and the matrix has no action for suppressing a
lead. Phase 16 gates the lead-level and bulk action on `acquisition.suppression.remove` (admin only:
whoever can undo a suppression may add one from a lead), in `bulkSuppressAction` and in the two
pages' capability maps. No role string is compared anywhere.

**Requested:** either add `acquisition.lead.suppress` (ADMIN only) to the matrix and switch the three
call sites to it, or confirm that the stand-in is the intended rule.

### CR-16-UNMATCHED-SCOPE · bug in Phase 13 (inbox) · needs a decision
`getUnmatchedReplies(actor)` asserts `acquisition.inbox.link` with no resource, so it is always
refused for a SERVICE_LEAD although the matrix grants them that action for their own lines. An
unmatched reply has no line, so the open question is who triages them. Phase 16 hides the
"Unmatched" tab for anyone the service refuses and shows a permission state on a direct link.
`getUnmatchedReplies` also isn't scoped to a line, so every line's inbox shows the same list.

**Requested:** decide who sees unmatched replies (managers and admins only, or each line's lead for
replies to that line's mailboxes) and make the service's check match the matrix.

### CR-16-INBOX-SERVICE-GUARDS · bugs in Phase 13 (inbox)
Each is guarded in `ui/inbox/actions.ts`; the guard and the service's write are two steps, so the
service should hold the rule.
- `linkReply` / `setReplyMatch`: no "still unmatched" check, so a reply that already belongs to a
  lead can be moved to another. Guard: `linkReplyAction` refuses a reply whose `leadId` is set.
- `assignThread`: accepts any user id as the new owner. Guard: `assignThreadAction` requires an
  active member of the lead's line team (`isOnLineTeam`).
- `sendReply`: doesn't refuse a reply classified `UNSUBSCRIBE` or `BOUNCE`, or a `SUPPRESSED` lead
  (INV-23 says an unsubscribe is never answered). Guard: `replyBlock` in `ui/inbox/inbox-types.ts`,
  applied by `sendReplyAction`, `regenerateDraftAction` and the page (no composer is shown).
- `logAssistedReply`: accepts a caller-supplied `receivedAt`. Guard: the action no longer sends one.
- `getInboxCounts`: counts by `ownerId = userId`, which is wrong for anyone who sees a whole line.
  The page counts the rows it loaded instead (`summariseRows`).
- `listThreads`: orders by `leadId` before `take`, so a short list isn't the newest threads and its
  date cursor can't be used. The page sorts what it gets, newest first.

### CR-16-PIPELINE-SERVICE-GUARDS · bugs in Phase 14 (pipeline)
- `assignHandoff`: accepts any service line and any user id. Guard: `assignHandoffAction` requires
  the line to be one the deal sold and the person to be an active member of that line's team.
- `markWon`: stores whatever `proposalId` it is given. Guard: `markWonAction` refuses a proposal
  that belongs to another lead.
- `sendProposal` and `sendOneOffEmail`: take any contact id. Guard: both actions require a live
  contact of the lead's own company (`isLeadContact`).
- `generateBrief` (Phase 11): no permission check. Guard: `regenerateBriefAction` authorises
  `acquisition.lead.update` on the lead first.
- `acknowledgeHandoff`: exists, but nothing in the specified screens calls it (the delivery owner's
  screen is not part of Phase 16). The unused action was removed from this phase.

### CR-16-DEAL-RECLOSE · schema, Phase 2 and Phase 14 · needs a decision
`Deal.leadId` is unique, so a lead that is lost, re-engaged and then won or lost again can't get a
second deal: `markWon` / `markLost` fail on the unique index. Until that is settled, the lead-detail
page shows the outcome panel only while the lead is actually `WON` or `LOST`, so a re-engaged lead
doesn't display a stale "Deal lost".

**Requested:** decide between one deal per closing (drop the unique index, add `closedAt` ordering)
and one deal per lead that is updated in place; then make `markWon` / `markLost` do that.

### CR-16-BOARD-BOUNDS · service gap in Phase 14
`listPipelineLeads` / `getPipeline` have no `take`: the board loads every open lead in the line.
Phase 16 shows at most 100 cards per stage after filtering (`STAGE_CARD_LIMIT` in
`ui/pipeline/board-types.ts`), says "100 of N" in the stage header and notes how many aren't shown,
but the service still reads them all.

**Requested:** a per-stage limit (or a cursor) in `PipelineQuery`, plus the true per-stage count.

### CR-16-SHELL-SHORTCUTS · bug in Phase 4 (shell patterns) · blocks the browser check
`src/components/patterns/shortcuts.tsx` and `command-palette.tsx` return a new array from
`getSnapshot` in `useSyncExternalStore` on every call, which makes React re-render without end in a
browser ("The result of getSnapshot should be cached"). Any page that registers a shortcut or a
command (the pipeline board and the inbox do) can crash the shell. The `phase/15-module-shell`
branch has uncommitted changes to both files that look like this fix. Two smaller problems in the
same files: `useShortcut` calls `preventDefault()` before the handler runs and knows nothing about
open dialogs (Phase 16 checks `overlayOpen()` itself), and `useCommand` keeps the command object
from mount, so its `perform` goes stale (the board registers through `registerCommand` in an effect).

**Requested:** cache the snapshot; call `preventDefault()` only when the handler acts; skip shortcuts
while a dialog, sheet or menu is open; re-register a command when its object changes.


**Fixed on this branch** (with the ownership guard off, at the owner's request); needs the owning phase's review at merge.

### CR-16-DIALOG-SCROLL · Phase 4 primitive
`DialogContent` has no maximum height and no side margin, so a long form runs off a short or narrow
viewport and its buttons can't be reached. Phase 16 passes `SCROLLING_DIALOG`
(`ui/leads/dialog-scroll.ts`) to every dialog it owns; the shared `ConfirmDialog` (Phase 18) can't
be given it.

**Requested:** put `max-h-[calc(100dvh-2rem)] overflow-y-auto` and a `w-[calc(100%-2rem)]` cap on
`DialogContent`, then delete `dialog-scroll.ts`.

### CR-16-TOUCH-TARGETS · Phase 4 primitives · needs a decision
Project rules ask for 48px touch targets. `Button size="sm"` is 36px and `IconButton` is 40px.
Phase 16 uses the default 48px button everywhere and sizes its own controls (chips, checkboxes,
drag handle, menus) to 48px, but it can't change the primitives other screens use.

**Requested:** decide whether `sm` and `IconButton` are allowed on touch screens; if not, raise them.

### CR-16-AVATAR-LABEL · bug in Phase 4 (shell primitives) · found in the browser
`Avatar` (`src/components/ui/avatar.tsx`) names itself with `aria-label` on a Radix `Avatar.Root`,
which renders a `<span>` with no role. ARIA forbids a label on a roleless span, and axe reports it
as a **serious** violation (`aria-prohibited-attr`) — one per avatar, so a list of them fails the
accessibility gate. Phase 16 found this when the e2e axe checks ran, and works around it with
`OwnerAvatar` (`ui/leads/owner-avatar.tsx`): it hides the picture from assistive technology
(`aria-hidden`) and gives the name as adjacent text, or as an `sr-only` label where there is no
visible name. Every Phase 16 screen uses `OwnerAvatar`; the bare `Avatar` is unchanged.

**Requested:** give `Avatar.Root` `role="img"` (so the `aria-label` is valid), then delete
`OwnerAvatar`. The `AvatarGroup` overflow badge has the same issue.

### CR-16-RELATIVE-TIME · Phase 4 primitive (minor)
`RelativeTime` formats its tooltip with date-fns' `zzz`, which gives "GMT+1" for Lagos where the
project format is "WAT". Phase 16's `formatDateTime` (`ui/leads/format.ts`) asks a fixed list of
locales for the short name. **Requested:** use the same helper in `RelativeTime`, and move it to
`@/lib`.

### CR-16-ACTION-RETHROW · Phase 1 library (minor)
`err()` in `src/lib/result.ts` turns every thrown value into a failed result, including the
redirect `requireUser()` throws when a session has expired, so an expired session reads as
"Something went wrong" instead of going to sign-in. Phase 16's actions use `failed()`
(`ui/leads/action-result.ts`), which calls `unstable_rethrow` first.

**Requested:** call `unstable_rethrow(error)` at the top of `err()`, then delete `failed()`.

## Candidate primitives to promote (B3.1)

Built locally because no shared equivalent exists in `@/components`. Promote where two or more Wave 4
phases built similar ones.

| Component | File | Notes |
|---|---|---|
| `DetailLayout` | `ui/leads/detail-layout.tsx` | Main column + side rail. Phase 4 deferred it. |
| `Timeline`, `TimelineItem` | `ui/leads/timeline.tsx` | Phase 4 deferred it. Used for activity and signals. |
| `ConversationThread` | `ui/inbox/conversation-thread.tsx` | Phase 4 deferred it. Shared by the inbox and lead detail. |
| `ScoreMeter` | `ui/leads/score-meter.tsx` | Score bar + value + band. |
| `EvidenceChip`, `SeverityBadge`, `MethodBadge` | `ui/leads/evidence-chip.tsx` | One severity-meta map. |
| `EvidenceGallery` (lightbox) | `ui/leads/evidence-gallery.tsx` | Keyboard-operable lightbox with mobile/desktop comparison. |
| `CurrencyInput` | `ui/leads/currency-input.tsx` | Minor-unit money field. Phase 18 asked for one too. |
| `KanbanBoard` | `ui/pipeline/kanban-board.tsx` | Phase 4 deferred it. Generic columns of draggable cards on dnd-kit: mouse, touch (with a hold delay, so the board still scrolls) and keyboard dragging, screen-reader announcements, collapsible columns, a 48px handle, a column footer. |
| `ToneBadge` | `ui/leads/tone-badge.tsx` | A `Badge` that always has an icon (the rule: colour, label and icon together). `Badge` itself could take an `icon`. |
| `DownloadLink` | `ui/leads/button-link.tsx` | A button-styled plain `<a>` for files (CSV export, signed file URLs). |
| `withPerson` | `ui/leads/select-options.ts` | Keeps the current owner in a select's options when they have left the team. |
| `safeHttpUrl` | `ui/leads/safe-url.ts` | Only http(s) URLs reach an `href`. Belongs in `@/lib`. |
| `formatDay`, `formatDateTime`, `localInputToIso` | `ui/leads/format.ts` | Date-only values in UTC, the project date-time format with a real zone name, and date inputs read in the profile timezone. Belong in `@/lib`. |
| `failureOf` | `ui/pipeline/action-failure.ts` | Client-side: a server action that never arrived becomes a message instead of an unhandled rejection. |
| `UrlToggle` | `ui/leads/url-toggle.tsx` | An on/off filter chip kept in the URL. Belongs beside `UrlSelect`. |
| `ContactabilityList` | `ui/leads/contactability-list.tsx` | Per-channel verdict with label, icon and reason. Used by lead detail and the inbox. |
| `useUrlParams` | `ui/leads/use-url-params.ts` | Writes filters and selections to the URL. Phase 18's `filters.tsx` has a private copy of the same hook. |
| `LeadsTable` | `ui/leads/leads-table.tsx` | Selectable, row-navigable data table. Merge with Phase 18's `AdminTable` into one `DataTable`. |
| `ButtonLink` | `ui/leads/button-link.tsx` | Exists only because `Button` has no `asChild` and doesn't export `buttonVariants`. Give `Button` one of those and delete it. |
| URL filter controls | `@/components/admin` | Phase 16 reuses Phase 18's `FilterBar` / `UrlSearchInput` / `UrlSelect` / `UrlDateInput`, plus `Field`, `Select` and `ConfirmDialog`. Two phases now depend on them: promote to `@/components/patterns` and `@/components/ui`. |

## Cross-links to confirm with Phase 15

- "Add lead" links to `lineHref(line, "search")` (Phase 15 owns the manual-add route).
- "Draft outreach" / "Open in review queue" link to `lineHref(line, "review", { lead: <leadId> })`.
  Confirm Phase 15's review queue reads a `lead` query param to focus one lead; repoint if it uses
  another name.

Both are covered by the route-map crawl in integration step C3.3.

## Notes

- nuqs is installed but not mounted (the layouts that could mount `NuqsAdapter` are owned by
  Phases 4/15). URL state uses `next/navigation` directly, as Phase 18 did. If client URL state is
  wanted later, mount `NuqsAdapter` in `src/app/(platform)/layout.tsx` at integration.
- Leads table collapses to cards below `lg` (not `md`): eight columns overflow a 768px tablet, so
  the wider breakpoint keeps the hard "no horizontal overflow" rule. Noted for the consistency pass.
- Audit screenshots and proposal PDFs are fetched through `getSignedUrl` and render through
  `next/image` with `unoptimized`, so `next.config.ts` needs no `images.remotePatterns` entry. On
  the Vercel Blob adapter those URLs are not really private: see CR-16-STORAGE-PUBLIC.
- A date typed into a dialog (snooze, next action, meeting times) is read in the viewer's profile
  timezone, not the browser's, so it matches how every date on the screen is shown.
- "Request approval" has no separate action: `createProposal` / `reviseProposal` already notify the
  managers when a proposal needs an exception approval, so the screen shows the waiting state.
- Notes are plain text with line breaks and teammate mentions (the notes service notifies each
  mentioned teammate). No markdown rendering.
