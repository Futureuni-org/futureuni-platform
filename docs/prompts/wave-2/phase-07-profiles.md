# Phase 7: Service-Line Profiles and the Runtime FUTUREUNI Skill

> **How to run this phase**
> 1. Wave 1 must be merged and integrated, and Part A of `wave-2-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 07 profiles`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-07-profiles.md and execute it. Plan first."**
>
> Wave 2. Runs in parallel with Phases 8, 9 and 10. Depends on Waves 0–1.

---

## Your role and the goal of this phase

You are encoding **how FUTUREUNI sells**, as data and runtime knowledge that the whole acquisition engine reads. Two outputs:

1. **Service-line profiles.** A versioned profile per service line (Web Development, UI/UX Design, Graphic Design, Video Editing) that tells the engine:
   - which signals mean a business needs FUTUREUNI
   - where to look for them, per market
   - which audits to run
   - how to score
   - what to say, per market
   - which portfolio pieces to show
   - what it costs
   - which sequences to run
   - when to disqualify
   - who owns the line

   The engine reads profiles; it never hardcodes line-specific behaviour. A fifth service line later is a new profile, not new code.
2. **The runtime FUTUREUNI acquisition knowledge.** The reference files in `runtime-skills/acquisition/_references/` that every acquisition AI task loads: the services catalogue, evidence rules, a playbook per line, and a playbook per market. This is what makes Claude's research and writing sound like FUTUREUNI, and stay truthful.

You also build the **profile services** (read, draft, validate, publish, diff, roll back) and the **profile linter**. Phase 18 builds the profile editor screen on top of them.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` (bans, invariants 5, 6, 7 and 11) and `docs/decisions.md`
2. `docs/specs/module-acquisition.md`, in full: service lines, markets, signals, scoring, outreach, sequences, approval modes, capacity
3. `docs/contracts/service-line-profile.md` and `src/contracts/service-line-profile.ts`. **Implement against this contract exactly.**
4. `docs/contracts/source-adapter.md` and `audit-agent.md`: the known adapter IDs and audit agent IDs your profiles may reference
5. The seeded `ServiceLineProfileVersion` rows from Phase 2 (`prisma/seed/`)
6. `src/platform/ai/README.md` and `runtime-skills/_shared/futureuni-voice/`: don't duplicate the voice skill; build on it
7. `src/platform/settings/README.md`, `src/platform/audit-log/README.md` and `@/platform/auth` (`assertCan`)
8. `docs/prompts/wave-2-prep-and-merge.md`: the reference file layout in Part B1 is fixed
9. `phases/*/SUMMARY.md` for every completed phase
10. The global skills `saas-data`, `saas-api`, `saas-ai` (prompts as files), `saas-testing` and `saas-review`

---

## What you own

- `src/modules/acquisition/profiles/**`
- `runtime-skills/acquisition/_references/**`
- `evals/acquisition/profiles/**`
- `phases/07/**`

---

## Step 1: Default profiles as code (`src/modules/acquisition/profiles/defaults/`)

Write one file per line (`web-development.ts`, `ui-ux-design.ts`, `graphic-design.ts`, `video-editing.ts`), each exporting a `ServiceLineProfile` that passes the contract schema. These are the **seed defaults**. At runtime the database version is the truth, and every edit creates a new version.

Each profile must fill every contract field richly. Below is the minimum content. Expand it with good judgement, so each profile reads like the playbook an experienced agency sales lead would write.

### Common to every profile

- **`signals[]`:**
  - an ID, label and description
  - a `weight`
  - which markets it applies to
  - the evidence it needs, for example "Places listing with no website field" or "job post title matching `/graphic designer/i`"
  - which source adapters can detect it
  - which audit checks confirm it
- **`sources[]`:** adapter IDs with default parameters per market: keyword sets, place types and job titles. Use only adapter IDs from the source-adapter contract. New ones Phase 8 may add are `youtube-channels` and `apple-app-store`; reference them as optional and note them in `REQUESTS.md`.
- **`audits[]`:** audit agent IDs and checks from the audit-agent contract, marked required or optional.
- **`scoring`:**
  - rules mapping conditions (signal present, finding severity, company size, has a reachable contact, market, legal form known) to points, capped at 100
  - the qualify threshold
  - the borderline band (default 40–60)
  - negative rules, for example "only generic info@ email: −5"
  - Phase 11 executes these rules; you define them.
- **`pitchAngles`:**
  - per market (`NIGERIA`, `INTERNATIONAL`), 3–5 angles
  - each with an ID, a one-line hook, when to use it (which signals and findings), the proof to attach (portfolio tags), and phrases to avoid
- **`portfolio[]`:**
  - placeholder entries with clear `TODO` markers (title, description, URL, media file key, tags, markets, outcome metric)
  - I'll replace them with real FUTUREUNI work
  - mark every placeholder `isPlaceholder: true` (add the field through a contract request if it's missing), so outreach never attaches a placeholder
- **`pricing`:**
  - packages per line, each with a name, what's included, and ranges in **NGN** for Nigeria and **USD and GBP** for international, in minor units
  - **These are business decisions I must confirm.** Use sensible, clearly labelled placeholder ranges, set `needsReview: true` on the pricing block, and list every figure for me in your summary.
- **`sequences`,** per market. Default multi-step sequences, each step with:
  - channel: `EMAIL` (automatic) or `WHATSAPP_ASSISTED` / `LINKEDIN_ASSISTED` / `CALL_TASK` (a human sends or does it)
  - delay
  - purpose (intro with an audit insight, value add, portfolio proof, soft break-up)
  - which pitch angle
  - stop conditions (any reply, bounce, unsubscribe, meeting booked)

  The defaults:
  - **Nigeria:** assisted WhatsApp first, then email.
  - **International:** email first, with a LinkedIn-assisted touch.
- **`disqualifiers[]`,** for example:
  - a competitor agency
  - a government body, if excluded
  - a company too large (it has an in-house team, detected from job posts for the full team)
  - an adult or gambling category
  - no reachable channel
  - an already-active client
- **`approvalMode`:** default `ALWAYS_REVIEW`.
- **`capacityPolicy`:** what happens when the owners are at capacity. Default: pause scheduled searches, and send new qualified leads to `NURTURE`.
- **`owners`:** role-based defaults (the `SERVICE_LEAD` users of this line), resolved at runtime through `@/platform/team`.

### Line-specific content (minimum)

- **Web Development:**
  - signals:
    - `no_website` (only a Places, Instagram, Facebook or Jiji presence)
    - `slow_mobile` (PageSpeed below threshold)
    - `no_ssl`
    - `not_mobile_friendly`
    - `outdated_site` (old copyright, legacy tech)
    - `broken_pages`
    - `weak_seo_basics`
    - `job_post_web_developer`
    - `ecommerce_on_social_only` (selling through DMs)
  - Nigeria sources: `google-places` in Lagos, Abuja, Port Harcourt, Warri and Benin City, targeting restaurants, clinics, schools, real estate, hotels, fashion, logistics and churches if not disqualified; `jobs-serpapi` for "web developer" in Nigeria.
  - International sources: `google-places` in target UK and US cities; `jobs-serpapi` and `jobs-adzuna`.
- **UI/UX Design:**
  - signals:
    - `app_reviews_usability_complaints`
    - `high_friction_signup`
    - `inconsistent_ui`
    - `accessibility_failures`
    - `recently_funded`
    - `job_post_product_designer`
  - sources: `apple-app-store` (apps in target categories with a low rating and review-text signals), job boards, funding news when available (optional, future)
- **Graphic Design:**
  - signals:
    - `inconsistent_branding` (logo, colours or type differ across website and social)
    - `low_quality_visuals`
    - `no_brand_system`
    - `new_business`
    - `weak_ad_creatives` (optional, future)
    - `job_post_graphic_designer`
- **Video Editing:**
  - signals:
    - `active_creator_rough_editing`
    - `no_captions`
    - `inconsistent_thumbnails`
    - `gone_quiet` (the posting gap is growing)
    - `long_unedited_uploads`
    - `job_post_video_editor`
  - sources: `youtube-channels` (by niche keywords and region), job boards

---

## Step 2: Profile services (`src/modules/acquisition/profiles/`)

Server-only, with Zod-validated server actions using the saas-api handler shape. Every mutation calls `assertCan` and `withAudit`.

- `getActiveProfile(line)` and `listActiveProfiles()`: **the exact `SEAM-PROFILE` signatures** (see the Wave 2 guide), cached per request
- `getProfileVersion(line, version)` and `listProfileVersions(line)`
- `saveDraft(actor, line, profile)`: creates or replaces an unpublished draft version
- `validateProfile(profile, known)`: the contract schema, **plus** reference checks:
  - every source adapter ID, audit ID and portfolio tag exists
  - every pitch angle's proof tags match at least one non-placeholder portfolio item, or it's flagged
  - scoring rules reference existing signals
  - sequence steps reference existing pitch angles
  - pricing currencies suit their market

  `known` holds the adapter IDs, audit IDs and users, and is injected. Default it to the contract lists so this works before Phases 8 and 10 merge.
- `publishProfile(actor, line, draftVersion, note)`: validates, deactivates the previous version, activates the new one, audits, and emits a `profile.published` event
- `rollbackProfile(actor, line, version)`
- `diffProfiles(line, a, b)`: a structured, human-readable diff for the Phase 18 editor
- `getLineOwners(line)`: resolves owners through `@/platform/team`
- `resolvePitchAngle(profile, market, { signals, findings })`: returns the best-matching angles, ranked, with the reason. Phase 12 uses it.
- `resolvePortfolio(profile, market, tags)`: returns matching **non-placeholder** items. Phase 12 uses it.
- `getPricingForLine(line, market)`: Phase 14 uses it for quotes.

**Seeding.** Add `src/modules/acquisition/profiles/seed.ts`, which the Phase 2 seed runner discovers. It upserts version 1 from the code defaults, but only when no version exists. Never overwrite a version edited in the database.

**`pnpm profiles:check`** is a linter that validates the active database profiles and the code defaults, and prints warnings (placeholder portfolio items, pricing that needs review, angles without proof). Add the script to your `REQUESTS.md` if you can't edit `package.json`; otherwise export a runnable file and document the command.

Also export `profilesSettings` (`settings.ts`), for example the default borderline band override, and list it in `REQUESTS.md` per the Wave 2 guide, Part B3.

---

## Step 3: Runtime reference files (`runtime-skills/acquisition/_references/`)

Create **exactly** the files listed in the Wave 2 guide, Part B1. They're loaded into prompts, so write them to be **dense, specific and useful to a model**. Use headings, bullet rules, do/don't pairs and short examples. No fluff. Each file has a version line and a "last reviewed" date at the top.

- **`services-catalogue.md`:** FUTUREUNI's four services:
  - what each includes
  - typical deliverables
  - timelines
  - packages, which match the profile pricing names but **leave out prices** (prices come from the profile at runtime, so they can't drift)
  - what FUTUREUNI doesn't do
- **`evidence-rules.md`:**
  - Every claim about a prospect must come from a supplied finding or signal, with its ID.
  - Never invent metrics, names, funding, awards or events.
  - How to phrase measured findings. Good: "Your homepage took 7.2s to load on mobile in our test on 3 Oct". Bad: "Your site is terrible".
  - How to handle uncertainty.
  - How to cite finding IDs in structured output.
  - Tone for criticism: respectful, specific, helpful.
- **`lines/<line>.md`,** one per line:
  - what "good" looks like, with concrete thresholds, for example Core Web Vitals targets or caption and thumbnail practices
  - the most common problems and how to recognise them from evidence
  - how to explain each problem's business impact in plain language
  - vocabulary to use and to avoid with non-technical owners
  - which portfolio proof fits which problem
- **`markets/nigeria.md`:**
  - tone: warm, respectful and professional; appropriate greetings; no slang in first contact
  - WhatsApp etiquette: short, first message identifies FUTUREUNI clearly, no walls of text, no voice notes in first contact, business hours
  - trust builders: local portfolio, a physical presence where true, references, flexible payment where true
  - naira pricing conventions
  - sectors and cities
  - common objections (price, "my nephew does it", "we use Instagram") and respectful answers
  - NDPA notes: lawful basis, honouring opt-outs
- **`markets/international.md`:**
  - tone by region (UK, US, EU)
  - the timezone-overlap angle (Lagos shares working hours with the UK and much of Europe) and how to use it honestly
  - currency and payment conventions
  - proof expectations: case studies, process, contracts
  - compliance notes: UK PECR (no cold email to sole traders or partnerships without consent), EU caution by country, US CAN-SPAM, and that every email carries an unsubscribe and the postal address
  - common objections (offshore quality, communication, timezones) with evidence-based answers

**Add a helper** `selectAcquisitionReferences({ serviceLine, market })`. It returns the ordered list of reference paths for a task:

1. catalogue
2. evidence rules
3. the line file
4. the market file(s): Both returns both

Export it for Phases 8–14 to use in their task definitions.

---

## Step 4: Evals for the references (`evals/acquisition/profiles/`)

The references shape every AI output, so prove they work. Register a small eval-only AI task, `acquisition.profile-sanity`, following the Phase 5 README. Given a line, a market, and a set of findings (some real, one missing), it writes a two-sentence opener. Write about 8 cases per line across both markets, checking:

- it cites only the supplied finding IDs
- it never invents a fact (include a trap case with an attractive but missing fact)
- the Nigeria cases avoid slang and walls of text
- the international UK cases don't mention anything that implies consent
- banned phrases from the voice skill are absent

Run them in mock mode (plumbing) and live if a key is available. Report the scores.

---

## Step 5: Tests

- **Unit tests:**
  - every default profile passes the contract schema and `validateProfile`
  - each validation rule catches its failure case (unknown adapter, angle with no proof, rule referencing an unknown signal, wrong currency for a market)
  - `resolvePitchAngle` ranking
  - `resolvePortfolio` never returns placeholders
  - `diffProfiles` output
- **Integration tests:**
  - publish creates a new active version, deactivates the old one, and writes an audit entry and an event
  - rollback works
  - seeding doesn't overwrite an edited version
  - a `SERVICE_LEAD` can publish only their own line (per the matrix)

---

## Constraints

- **Don't edit the manifest, schema or contracts.** Use requests (Wave 2 guide, Part B3).
- **Don't invent real FUTUREUNI facts:** no client names, portfolio items, prices or addresses. Use clearly marked placeholders, and list them for me.
- **No UI.** Phase 18 builds the profile editor.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] All four default profiles are complete, contract-valid and pass `validateProfile`.
- [ ] Profile services work: get, list, draft, validate, publish, roll back, diff, pitch-angle and portfolio resolvers, pricing lookup, and owners. `getActiveProfile` and `listActiveProfiles` match the `SEAM-PROFILE` signatures exactly.
- [ ] The seed is safe (never overwrites edits), and `profiles:check` works.
- [ ] Every reference file in the Wave 2 guide, Part B1 exists, and `selectAcquisitionReferences` is exported.
- [ ] The profile sanity evals run. The results are in the summary.
- [ ] `phases/07/REQUESTS.md` lists: settings to register, contract requests (for example `isPlaceholder`, new adapter IDs), and the `profiles:check` script.
- [ ] `phases/07/SUMMARY.md` includes a **"For Prince to confirm"** list covering every placeholder price, portfolio slot, disqualifier choice and sector list.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
