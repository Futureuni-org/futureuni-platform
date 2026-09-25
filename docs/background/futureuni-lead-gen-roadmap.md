# FutureUni — Lead Generation & Client Conversion System
## Build Roadmap

> Note: A few specifics (target client type, exact enrichment/outreach vendors, ICP details) are marked as `[CONFIRM]` — fill these in once decided, then hand the relevant stage prompt to Claude Code.

---

## 1. General Goal / Vision

Build an automated system that:

1. **Sources** potential leads (companies/contacts matching FutureUni's ideal customer profile) from multiple channels.
2. **Enriches** each lead with firmographic and contact data.
3. **Scores** leads so the team knows who's worth prioritizing.
4. **Runs outreach sequences** automatically (email/LinkedIn/etc.) with personalization.
5. **Uses Claude** at the judgment-heavy steps (personalized messaging, qualification of ambiguous leads, lead summaries) — governed by a single shared Skill/spec so behavior stays consistent.
6. **Surfaces everything** on an internal dashboard so sales/ops can review, override, and act.
7. **Tracks conversion** end-to-end (sourced → contacted → replied → meeting → converted) so the team can see what's actually working and double down on it.

The system should be modular — each stage is a separate, independently testable component that reads/writes from a shared database. Nothing should be a monolith.

---

## 2. Architecture at a Glance

```
[Sourcing Modules] → [Leads DB] → [Enrichment] → [Scoring] → [Outreach Engine] → [CRM/Dashboard]
                                                       ↑
                                          [Claude judgment layer, via Skill]
```

- **Deterministic pipeline steps** (sourcing, enrichment API calls, storage, sequencing) run as independent scripts/workers — no LLM needed.
- **Claude is called only at specific steps** where judgment/generation adds value.
- **Dashboard** is a read/write layer on top of the DB — visibility + manual override, not where automation logic lives.

---
 
## 3. Stages

### Stage 0 — Project Scaffolding

**Goal:** Set up the repo structure, environment, and tooling before writing any pipeline logic.

**Prompt for Claude Code:**
```
Set up a new Python project called "futureuni-leadgen" with the following structure:

futureuni-leadgen/
  sourcing/
  enrichment/
  scoring/
  outreach/
  claude_layer/
  dashboard/
  db/
  tests/
  CLAUDE.md
  .env.example
  requirements.txt
  README.md

Use Poetry or a simple requirements.txt (your choice, but be consistent).
Set up a .env.example listing placeholder environment variables for:
- DATABASE_URL
- ANTHROPIC_API_KEY
- ENRICHMENT_API_KEY (placeholder name)
- OUTREACH_API_KEY (placeholder name)

Include a basic README explaining the folder structure and how to run each module.
Do not implement any pipeline logic yet — just scaffolding.
```

---

### Stage 1 — Data Layer (Database Schema)

**Goal:** Design the shared schema every other stage reads/writes to.

**Prompt for Claude Code:**
```
Design and implement a Postgres schema (using SQLAlchemy models + Alembic migrations)
for a lead generation system with these entities:

- companies: id, name, domain, industry, size_range, source, created_at
- contacts: id, company_id (FK), full_name, role, email, phone, linkedin_url, source, created_at
- leads: id, contact_id (FK), company_id (FK), status (enum: new, enriched, scored, contacted,
  replied, meeting_booked, converted, disqualified), score (nullable int), score_reason (text),
  created_at, updated_at
- outreach_events: id, lead_id (FK), channel (enum: email, linkedin, sms), event_type
  (enum: sent, opened, clicked, replied, bounced), message_content (text), sent_at
- notes: id, lead_id (FK), author, content, created_at (for manual sales notes/overrides)

Write the SQLAlchemy models, an Alembic setup, and a seed script with 5 fake leads
for local testing. Include a db/README.md explaining how to run migrations locally.
```

---

### Stage 2 — Lead Sourcing Modules

**Goal:** Build independent, swappable sourcing modules that all write into the `companies`/`contacts`/`leads` tables.

**Prompt for Claude Code:**
```
Build a sourcing module in sourcing/ with a common interface: each source is a class
implementing `fetch_leads() -> list[RawLead]`, where RawLead is a simple dataclass with
company name, domain, contact name, role, email (if available), and source name.

Implement these sourcing modules to start:
1. sourcing/csv_import.py — imports leads from a manually uploaded CSV (name, company,
   email, role columns). This should work standalone with no external API, for testing
   the rest of the pipeline before real integrations are wired up.
2. sourcing/manual_api_stub.py — a stub module with the same interface, ready to be
   replaced with a real API integration (e.g. Apollo.io or a job-board monitor) [CONFIRM
   which source to build first].

Each module should write results into the `companies`, `contacts`, and `leads` tables
from Stage 1, deduplicating on company domain + contact email. Add a CLI entrypoint
(sourcing/run.py) that runs a given source and reports how many new leads were added.

Include unit tests using the CSV importer with sample data.
```

---

### Stage 3 — Enrichment

**Goal:** Take "new" leads and enrich them with firmographic/contact data before scoring.

**Prompt for Claude Code:**
```
Build an enrichment module in enrichment/ that:

1. Queries the leads table for leads with status "new"
2. For each, calls an enrichment API (start with a stub/mock client in
   enrichment/mock_client.py that returns fake but realistic data — I'll swap in a real
   API like Clearbit/Hunter/Apollo later) [CONFIRM provider]
3. Updates the company/contact records with enriched fields (industry, size, tech stack
   if available)
4. Updates lead status to "enriched"
5. Logs failures (e.g. no data found) without crashing the batch

Add a CLI entrypoint (enrichment/run.py) that processes leads in batches of 50,
with basic rate-limiting/retry logic. Include unit tests using the mock client.
```

---

### Stage 4 — Scoring

**Goal:** Prioritize leads with a transparent, tunable scoring system.

**Prompt for Claude Code:**
```
Build a scoring module in scoring/ that takes an enriched lead and returns a score
(0-100) plus a human-readable reason string.

Start with rule-based scoring using this initial rubric [CONFIRM/replace with real
FutureUni ICP criteria]:
- Industry match to target list: +30
- Company size in target range: +20
- Contact role is decision-maker level (e.g. Director+/Founder/Head of X): +25
- Company domain has a business (non-generic) email: +10
- Recency of company activity/hiring signal (if available): +15

Implement this as a pure function `score_lead(lead_data: dict) -> tuple[int, str]` so
it's easy to unit test and later swap for an ML model. Add a CLI entrypoint
(scoring/run.py) that scores all "enriched" leads and updates their status to "scored".

Include unit tests covering edge cases (missing fields, borderline scores).
```

---

### Stage 5 — Claude Judgment Layer (the "Skill")

**Goal:** Add Claude-powered steps for tasks that need reasoning/generation, governed by one shared spec so behavior is consistent across calls.

**Prompt for Claude Code:**
```
Build a claude_layer/ module that wraps calls to the Anthropic API for three tasks,
each using the shared context/spec defined in CLAUDE.md (read it before implementing):

1. claude_layer/personalize_outreach.py — given a lead's enriched data, generates a
   short personalized outreach message (email opener, 2-3 sentences) following
   FutureUni's tone and value proposition as defined in CLAUDE.md.

2. claude_layer/qualify_ambiguous_lead.py — given a lead that scored in a borderline
   range (e.g. 40-60), asks Claude to review the enriched data and return a
   qualify/disqualify recommendation with a one-sentence reason, to assist (not replace)
   human review.

3. claude_layer/lead_summary.py — given a lead's enriched data, generates a 2-3 sentence
   "why this lead matters" summary for the sales team to see on the dashboard.

Each function should:
- Take structured lead data as input
- Build a prompt using shared conventions from CLAUDE.md
- Call the Anthropic API (model: use the latest Claude model, temperature low e.g. 0.3
  for consistency)
- Return structured output (use response format guidance from CLAUDE.md)
- Log the prompt/response pair for auditing

Include unit tests using mocked API responses (do not call the real API in tests).
```

---

### Stage 6 — Outreach Automation

**Goal:** Send sequenced outreach and track engagement events.

**Prompt for Claude Code:**
```
Build an outreach module in outreach/ that:

1. Queries leads with status "scored" and score above a configurable threshold
   (default 60)
2. Calls claude_layer/personalize_outreach.py to generate message content per lead
3. Sends the message via an outreach provider API — start with a mock client
   (outreach/mock_provider.py) simulating send/open/reply events, ready to be swapped
   for a real provider (e.g. Instantly/Smartlead/HubSpot) [CONFIRM provider]
4. Records each send in outreach_events and updates lead status to "contacted"
5. Includes a webhook handler stub (outreach/webhook.py) for receiving reply/open
   events from the real provider later, updating lead status accordingly
   (e.g. "replied" on reply — and immediately halting further automated sends to
   that lead)

Add a CLI entrypoint (outreach/run.py). Include unit tests using the mock provider.
```

---

### Stage 7 — Dashboard

**Goal:** Give the team visibility into the funnel and a way to manually act on leads.

**Prompt for Claude Code:**
```
Build a lightweight internal dashboard (FastAPI + a simple React or server-rendered
HTML frontend — your call, keep it simple) in dashboard/ that shows:

1. A funnel view: counts of leads at each status (new → enriched → scored → contacted
   → replied → meeting_booked → converted)
2. A lead list/table, filterable by status, score range, and source, showing the
   Claude-generated summary (from Stage 5) for each lead
3. A lead detail view showing enrichment data, score + reason, outreach history, and
   a free-text notes field (writes to the notes table)
4. A manual action button per lead: "Mark as meeting booked" / "Mark as converted" /
   "Disqualify" — updating lead status directly

No auth needed for v1 (internal use only, single environment). Include a
dashboard/README.md on how to run it locally.
```

---

### Stage 8 — Orchestration & Scheduling

**Goal:** Wire the stages together to run on a schedule instead of manually.

**Prompt for Claude Code:**
```
Set up a scheduling layer (using a simple approach — cron, or APScheduler within a
single long-running Python process, your call) that runs, in order, on a configurable
schedule (default: every 4 hours):

1. sourcing/run.py (all configured sources)
2. enrichment/run.py
3. scoring/run.py
4. outreach/run.py

Log each run's summary (leads processed, errors) to a simple log file or table.
Add a orchestration/README.md explaining how to configure the schedule and how to
run the full pipeline manually for testing.
```

---

### Stage 9 — Testing, Monitoring & Iteration

**Goal:** Make sure the system is observable and that the team can improve scoring/messaging over time based on real conversion data.

**Prompt for Claude Code:**
```
Add:

1. A simple metrics module (monitoring/metrics.py) that computes conversion rates
   between each funnel stage over a given time window, queryable from the dashboard.
2. An export script (monitoring/export_for_review.py) that pulls converted vs.
   disqualified leads with their scores and enrichment data, so the score rubric
   in scoring/ can be manually reviewed and tuned based on real outcomes.
3. Basic error alerting (e.g. log to a file + optional Slack webhook stub) for
   pipeline failures in any stage.

Include a short docs/iteration-guide.md explaining how the team should periodically
review scoring accuracy and update the rubric or the Claude Skill spec in CLAUDE.md
based on what's actually converting.
```

---

## 4. Suggested Build Order

1. Stage 0 (scaffolding) → Stage 1 (DB) → Stage 2 (sourcing, CSV import first for testing)
2. Stage 3 (enrichment, mock client) → Stage 4 (scoring)
3. Stage 5 (Claude layer) — once you have real enriched leads to test personalization on
4. Stage 6 (outreach, mock provider) → Stage 7 (dashboard)
5. Stage 8 (orchestration) once individual stages are verified end-to-end manually
6. Stage 9 (monitoring) once real leads have started flowing through and converting

Swap mock clients (enrichment, outreach) for real provider integrations once `[CONFIRM]` items are decided — the interfaces are built to make that a drop-in change.

---

## 5. Open Decisions to Confirm Before/During Build

- Target client type (B2B companies / individual students / institutions)
- Enrichment provider (Clearbit / Hunter / Apollo / other)
- Outreach provider (Instantly / Smartlead / HubSpot / other)
- Scoring rubric weights (should reflect FutureUni's actual ICP, not the placeholder above)
- Whether the dashboard needs auth/multi-user access for v1
