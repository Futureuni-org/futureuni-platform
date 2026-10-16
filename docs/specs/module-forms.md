# Module spec: Client Forms (`forms`)

**Status:** F1 shipped (2026-10-16). F2–F5 planned.
**Owner:** FUTUREUNI internal platform.
**Read with:** `docs/specs/platform.md`, `docs/specs/data-model.md`, `.claude/project-rules.md`,
`docs/prompts/wave-5/adding-a-new-module.md`.

---

## 1. What this module is for

FUTUREUNI sends a prospect a link, the prospect answers questions about the job, and the answers
arrive inside the platform as a readable brief the team can act on. Today that happens over
WhatsApp voice notes and half-finished documents; the brief gets rebuilt by hand before anyone can
quote the work.

Client Forms is the second tool in the platform (Client Acquisition is the first). It owns:

- a **form definition** — the questions, their order, their help text and their validation;
- the **public form** the prospect fills in, at `/f/<slug>`, with no login and no account;
- the **submission** that comes back, stored once, rendered as a brief for the team;
- later, the **builder** that lets a non-developer create a form for any prospect in minutes.

It is not a general-purpose survey product. It is the intake step of FUTUREUNI's own sales and
delivery process, so it optimises for one thing: the first concept we show a client is already
close, because we asked the right questions up front.

### Relationship to Client Acquisition

The two modules do not import each other (lint enforces this). A form definition may carry a
`serviceLine` tag, and a submission may later be linked to an acquisition lead by foreign key
through the shared directory — never by reaching into `src/modules/acquisition/**`.

---

## 2. What F1 shipped (2026-10-16)

The first prospect form was needed in an hour, so F1 is deliberately narrow and complete rather
than broad and half-built:

| Shipped | Deferred |
|---|---|
| Form definitions as typed TypeScript, validated by `@/contracts/forms` at module load | Definitions in the database, edited in the UI (F2) |
| One definition: `ai-music-video-brief` (12 sections, 30 questions) | Any second form, duplication, versioning UI (F2) |
| Public renderer at `/f/<slug>`: one scrolling column, per-section progress, autosave to the device, required-field validation, submit | Multi-page forms, conditional questions, file upload (F3) |
| Submissions in Postgres (`frm_form_submissions`), server-validated against the definition | Submission status workflow, assignment, reply-from-platform (F4) |
| Internal `/forms`: every form, its submissions, one brief per submission, copy-as-text | Export, search, filters, analytics (F4) |
| Copy-the-brief fallback on the public page, so a failed submit still reaches us over WhatsApp | — |
| In-app notification to admins and managers when a brief arrives | Email digest, per-form notification routing (F4) |

**Why definitions are code in F1.** The renderer is driven entirely by the
`FormDefinition` JSON shape in `@/contracts/forms`. F2 adds a `frm_form_definitions` table whose
`definition` column holds *that same shape*, and a loader that prefers the database and falls back
to the code registry. No renderer, no field component and no validation rule is rewritten — the
builder is a new writer for an existing contract. Nothing in F1 is throwaway.

---

## 3. Users and permissions

Every action is an entry in the module manifest's permission list, evaluated by
`@/platform/auth`. Scope columns are ADMIN, MANAGER, SERVICE_LEAD, MEMBER.

| Action | Label | ADMIN | MANAGER | SERVICE_LEAD | MEMBER |
|---|---|---|---|---|---|
| `forms.module.access` | Open Client Forms | ALL | ALL | ALL | ALL |
| `forms.form.read` | View forms and their links | ALL | ALL | ALL | ALL |
| `forms.submission.read` | Read submitted briefs | ALL | ALL | ALL | ALL |
| `forms.submission.export` | Export briefs | ALL | ALL | ALL | NONE |
| `forms.form.manage` | Create and edit forms (F2) | ALL | ALL | LINES | NONE |
| `forms.submission.delete` | Delete a brief | ALL | NONE | NONE | NONE |

The prospect is **not** a user. The public form authenticates nothing; it is reachable by anyone
holding the link, and it is protected by: a published-only lookup, server-side validation against
the definition, a payload cap, and per-IP rate limiting on submit.

---

## 4. Data model

`prisma/schema/forms.prisma`. Every table is prefixed `frm_`. Forms tables may reference core
tables; core never references these.

### F1

```
FormSubmission            frm_form_submissions
  id              String    cuid, pk
  formSlug        String    the definition's slug (no FK in F1 — definitions are code)
  formVersion     Int       the definition version the prospect answered
  formTitle       String    snapshot, so a renamed form keeps old briefs readable
  status          enum      COMPLETE
  answers         Json      FormAnswers, validated on write by @/contracts/forms
  contactName     String?   denormalised from the answers for the list view
  contactEmail    String?   denormalised
  submittedAt     DateTime  tz(3)
  createdAt       DateTime  tz(3)
  @@index([formSlug, submittedAt])
```

`answers` is the only place prospect-provided content lives. It is a JSON object keyed by field
key; values are strings or string arrays, and nothing else parses. The denormalised
`contactName` / `contactEmail` exist so the submissions list does not have to open every JSON blob,
and are derived server-side from fields the definition marks with `role: "contactName"` /
`role: "contactEmail"`.

### F2 adds

```
FormDefinitionRecord      frm_form_definitions
  id, slug (unique), title, status (DRAFT|PUBLISHED|CLOSED), version,
  definition Json   -- exactly the FormDefinition contract shape
  serviceLine?, prospectLabel?, createdById, publishedAt?, createdAt, updatedAt
```

and a nullable `formId` on `FormSubmission` pointing at it.

---

## 5. Route map

| Route | Who | What |
|---|---|---|
| `/f/<slug>` | public, no session | The form. Light, one column, 375px up. `(forms)` route group with its own layout, so the platform shell never renders around it. |
| `/forms` | `forms.form.read` | Every form: title, status, submission count, public link to copy. |
| `/forms/<slug>` | `forms.submission.read` | That form's submissions, newest first. |
| `/forms/<slug>/<submissionId>` | `forms.submission.read` | One brief, section by section, with copy-as-text. |

`/f/` is allowlisted in `src/proxy.ts` `PUBLIC_PREFIXES`, like `/u/`. The public page sets
`robots: noindex` — a prospect's brief link is private by obscurity and must never be indexed.

Submission is a server action on the public page (`submitFormAction`), not a REST endpoint: there
is no third-party caller. It returns `ActionResult<{ submissionId }>` and never throws to the
client.

---

## 6. Screens and their states

**Public form (`/f/<slug>`) — one section per step**

Thirty questions on one page reads as homework, so the form is a wizard: one section per step,
plus a final "Check and send". The step lives in the URL (`?step=<section key>`), so Back walks
back through the sections, a refresh returns to the same step, and the server renders step one
without guessing.

*Art direction — Editorial Ledger (phases/04/SUMMARY.md), not a white page with inputs.* A
prospect must see at a glance that FUTUREUNI built this:

- A deep-navy brand rail (`bg-heading`) carries the FUTUREUNI mark and wordmark — the same plane,
  lockup and display type as the platform's own sign-in. Full height beside the step on desktop, a
  band across the top on a phone.
- The rail lists every section as a numbered ledger and marks the open one exactly as the
  platform's sidebar marks the open page: the 2px violet reading rule plus a 10% white fill. Each
  row shows a tick when the section is complete, or a dot when a required answer is still missing
  and the prospect has already been past it.
- Mono tabular numerals for every count and step number ("03 / 13", "9 of 30 answered"), the
  platform's data face.
- Display type for the step heading; no cards anywhere — spacing and hairlines only.
- A violet progress rail in the brand plane that fills as answers land.

- *Loading*: server-rendered; no spinner. The definition is static.
- *Filling*: the open section's questions only. Answers save to the device on change
  (`localStorage`, one key per slug): close the tab, come back, nothing is lost.
- *Appearance*: light / dark / device, switched from the rail and stored under the platform's own
  theme key.
- *Moving on*: "Next" stops on a required question that is still empty, scrolls to it and names
  what is missing. Everything else may be left blank and returned to from the ledger.
- *Invalid*: errors are never colour-only; each is text tied to its field with `aria-describedby`.
- *Check and send*: the last step shows the whole brief, section by section, with "Change" back
  into any section.
- *Submitted*: a confirmation panel, the brief as plain text, a copy button, and the WhatsApp and
  email handoff — so the prospect can still reach us if anything went wrong.
- *Failed*: the error message, the same copyable brief, and the handoff. Never a dead end.
- *Before hydration*: the buttons are disabled. Without that, a tap before React attaches its
  handler is a plain browser submit, which navigates away with the answers in the query string.
- *Unknown or unpublished slug*: `notFound()`.

**Internal forms list (`/forms`)**
- *Empty*: "No forms yet" with a pointer to the spec (F2 replaces it with "Create a form").
- *Loaded*: one row per form — status badge, submission count, newest submission, copy-link.

**Submissions list (`/forms/<slug>`)**
- *Empty*: "No one has filled this in yet", plus the public link to send.
- *Loaded*: contact name, email, relative time, and the first line of the brief.

**One brief (`/forms/<slug>/<submissionId>`)**
- Section-by-section answers, unanswered questions shown as "Not answered" rather than hidden, so
  the team can see what to chase. Copy-as-text for pasting into a proposal or a chat.
- *Not found*: `notFound()`.

---

## 7. Non-functional requirements

- **375px first.** The prospect is on a phone. Single column, 48px tap targets, no horizontal
  scroll, no fixed bars.
- **Accessibility.** Every field has a real `<label>`; choice groups are `<fieldset>` +
  `<legend>`; errors are linked with `aria-describedby` and announced; focus is visible.
- **No tracking.** The public page loads no analytics, no third-party script, no font beyond the
  platform's self-hosted ones.
- **Data minimisation.** Only what the form asks for is stored. Logs carry the submission id and
  the slug, never answers. Retention: briefs are business records; F4 adds a purge job once a
  retention period is agreed.
- **Payload cap.** 128 KB of answers, 5 000 characters per text answer, 40 selections per
  multi-choice field — enforced in `@/contracts/forms`, so the renderer and the server agree.

---

## 8. Phase plan

| Phase | Name | Scope | Done when |
|---|---|---|---|
| **F1** | Module skeleton and the first form | Contract, schema, module, renderer, public route, internal read screens, the music-video brief | A prospect can fill in `/f/ai-music-video-brief` and the team reads it at `/forms`. **Shipped.** |
| **F2** | The form builder | `frm_form_definitions`, DB-first loader, `/forms/new` and `/forms/<slug>/edit`, section and field editors, duplicate-a-form, publish/close, version bump on publish | A manager builds and publishes a new form without a developer |
| **F3** | Richer questions | File upload (platform storage), conditional questions ("show if"), number and date fields, multi-page forms with a progress bar, per-form thank-you copy | The music-video brief collects the song file and photos directly |
| **F4** | Working the brief | Submission status (NEW / REVIEWED / QUOTED / ARCHIVED), assignment, internal notes, export to CSV and PDF, search and filters, email digest, link a brief to an acquisition lead via the shared directory | A brief moves from arrival to quote inside the platform |
| **F5** | Hardening and handover | Rate-limit and abuse review, retention purge, e2e journeys, runbook and onboarding sections, cost note | `pnpm check` green, runbook updated, module in the launch checklist |

Each phase after F1 runs as its own worktree branch (`pnpm phase start`), with a prompt written the
way the acquisition prompts were written, and its own `REQUESTS.md` for anything outside its paths.

---

## 9. Ownership

`scripts/ownership/ownership.json` gains one entry per phase, mirroring the CLAUDE.md table. Phase
keys there are two digits and the platform build used 0–21, so this module's phases continue the
sequence: **F1 is phase 22**, and F2–F5 become 23–26 as they start.

| Owner | Paths |
|---|---|
| 22 (F1) | `src/contracts/forms.ts`, `src/contracts/forms.test.ts`, `prisma/schema/forms.prisma`, `src/modules/forms/**`, `src/app/(forms)/**`, `src/app/(platform)/forms/**`, `docs/specs/module-forms.md` |

F2–F5 take sub-paths of `src/modules/forms/**` the same way the acquisition phases split that
module. Until those phases start, the module is maintained on `main`.

---

## 10. Open questions

1. **Retention.** How long do we keep a brief from a prospect who never becomes a client? Needs an
   answer before F5. Proposal: 24 months, then purge the answers and keep the metadata.
2. **Who gets notified.** F1 notifies admins and managers. Should a form carry an owner instead,
   so only that person is told?
3. **Branding.** The first prototype used a pink-and-navy client-facing palette. F1 renders on the
   platform's own tokens so there is one design system to maintain. If FUTUREUNI wants a distinct
   client-facing skin, that is a Phase 4 token decision (a `client` theme), not per-form CSS.
