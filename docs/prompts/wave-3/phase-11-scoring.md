# Phase 11: Scoring, Qualification, Briefs, Cross-Sell and Capacity Throttling

> **How to run this phase**
> 1. Wave 2 must be merged and integrated, and Part A of `wave-3-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 11 scoring`, then open Claude Code in the worktree. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-11-scoring.md and execute it. Plan first."**
>
> Wave 3. Runs in parallel with Phases 12, 13 and 14. Depends on Waves 0–2.

---

## Your role and the goal of this phase

You decide **which audited leads deserve FUTUREUNI's time, and why**. For every `AUDITED` lead, you:

1. **Score it** with the profile's rules, from 0 to 100, with an itemised explanation.
2. **Decide the outcome:**
   - qualify, which moves it to `SCORED`
   - disqualify, with a reason
   - hold it in `NURTURE` because the line's team is at capacity
3. **Get a second opinion from Claude** on borderline leads. The recommendation assists a human; it never replaces one.
4. **Write the lead brief:** two or three sentences on why this lead matters, the key findings, and a suggested angle.
5. **Detect cross-sell:** one company qualifying for several lines becomes one group with one leading line, so FUTUREUNI speaks with one voice.
6. **Throttle outreach** when a line's owners are near or at capacity, and release held leads when capacity frees up.

**No UI.** Phases 15–17 display scores, briefs, reviews and cross-sell on your services.

---

## Step 0: Read first

1. `CLAUDE.md`, `.claude/project-rules.md` and `docs/decisions.md`
2. `docs/specs/module-acquisition.md`: the scoring, cross-sell, capacity and lead lifecycle sections
3. `docs/contracts/service-line-profile.md`: the `scoring` and `capacityPolicy` shapes
4. **`docs/prompts/wave-3-prep-and-merge.md`:** you **provide** `SEAM-LEAD-BRIEF`, `SEAM-THROTTLE` and `SEAM-CROSSSELL` with the exact signatures, and you own the transitions listed for Phase 11 in B1
5. The README of each of these, since you'll call them:
   - `@/modules/acquisition/profiles` (`getActiveProfile`, `resolvePitchAngle`)
   - `@/modules/acquisition/audits` (findings, dismissed flag)
   - `@/modules/acquisition/compliance` (`getContactability`)
   - `@/modules/acquisition/core`
   - `@/platform/team` (`getLineCapacity`, `isLineAtCapacity`)
   - `@/platform/ai`
   - `@/platform/jobs`, `@/platform/events`, `@/platform/notifications`, `@/platform/settings`, `@/platform/audit-log`, `@/platform/auth`
6. `phases/*/SUMMARY.md` for every completed phase
7. The global skills `saas-ai`, `saas-data`, `saas-api`, `saas-testing` and `saas-review`

---

## What you own

- `src/modules/acquisition/scoring/**`
- `src/modules/acquisition/crosssell/**`
- `runtime-skills/acquisition/score-*/**`
- `evals/acquisition/score-*/**`
- `phases/11/**`

---

## Step 1: The scoring engine (`scoring/engine.ts`)

**`scoreLead(input)`** is a pure function: no I/O, fully testable.

- **Input:** the lead, its signals, its **non-dismissed** findings, the company attributes (size, legal form, market, country, has a website), the contactability verdict, and the line profile's `scoring` block.
- **Evaluating rules:** each rule is `{ id, label, condition, points }`. Conditions are a small typed expression language defined by the profile contract, for example `signal:no_website`, `finding.severity>=HIGH:web.pagespeed_mobile`, `company.legalForm in [LIMITED, LLP]`, `contact.primary.emailStatus == VALID`, `market == NIGERIA`. If the contract's condition format is too loose to evaluate safely, implement a strict parser for it and raise a contract request documenting the grammar.
- **Output:**

  ```ts
  { score: number /* clamped 0..100 */, reasons: Array<{ ruleId; label; points }>, band: "QUALIFIED" | "BORDERLINE" | "BELOW" }
  ```

  The reasons are sorted by absolute points.
- **Deterministic:** the same input always gives the same output. Snapshot a set of golden inputs per line.

---

## Step 2: Qualification (`scoring/qualify.ts`)

**`qualifyLead(leadId, { actor, jobRunId?, now })`:**

1. Load everything and run `scoreLead`.
2. **Channel check,** from contactability:
   - No usable channel (email `BLOCKED`, and no WhatsApp, LinkedIn or phone) gives `DISQUALIFIED` with the reason `no_channel`.
   - Email `CONSENT_REQUIRED` or `REVIEW`, with an assisted channel available, continues but flags `complianceReview: true`.
3. **Profile disqualifiers:** if any match, the lead goes to `DISQUALIFIED` with the reason `disqualifier:<id>`.
4. **By band:**
   - `QUALIFIED` gives `SCORED`.
   - `BORDERLINE` runs the Claude review (Step 3), then moves to `SCORED` with `needsHumanReview: true` and the stored `ScoreReview`. **A borderline lead is never auto-disqualified.**
   - `BELOW` gives `DISQUALIFIED` with the reason `low_score`. Alternatively, if the profile says low-score leads go to `NURTURE` (a setting), send them there instead.
5. **Capacity:** if the throttle for the line is `PAUSED`, send qualified leads to `NURTURE` with the reason `capacity`, instead of `SCORED`.
6. Save the score, reasons and band on the lead, plus a score history entry in the `LeadEvent` metadata. Write the brief (Step 4). Emit `lead.scored`.

**Re-scoring:**

- Subscribe to `audit.completed`, a new signal, and `compliance.verdict.changed`, and re-score active leads that haven't been contacted yet.
- A nightly job re-scores `SCORED` leads older than N days.
- A score change never moves a lead backwards once it's `CONTACTED`.

---

## Step 3: Claude's borderline review (`runtime-skills/acquisition/score-borderline-review`)

Register **`acquisition.score-borderline-review`** (balanced tier):

- **Input:** the score and reasons, the signals, the findings (with IDs), company facts, the line, the market, and the profile's disqualifiers.
- **Output:** `{ recommendation: "QUALIFY" | "DISQUALIFY" | "NEEDS_HUMAN", confidence, reasons: string[], citedFindingIds: string[], riskFlags: string[] }`
- References come from `selectAcquisitionReferences` (now required).
- Stored as a `ScoreReview` row.
- **Services:**
  - `acceptReview(actor, leadId)`
  - `overrideReview(actor, leadId, decision, note)`: the human decision is final, audited, and recorded as feedback for calibration

Evals: at least 10 cases per line group, including:

- a clear good fit wrongly scored low
- a disguised competitor agency
- a franchise with central branding (graphic design isn't needed)
- an injection attempt in a finding's evidence text
- a genuinely unclear case, where the expected answer is `NEEDS_HUMAN`

---

## Step 4: Lead briefs (`runtime-skills/acquisition/score-lead-brief`)

Register **`acquisition.score-lead-brief`** (fast or balanced tier):

- **Input:** company facts, the line, the market, the top pitchable findings (with IDs), signals, score reasons, and the cross-sell context.
- **Output:** `{ brief: string /* 2–3 sentences */, keyFindingIds: string[] /* max 3 */, suggestedAngleId: string | null, talkingPoints: string[] /* max 3 */ }`
- **Rules:**
  - Validate with `assertClaimsCited`.
  - `suggestedAngleId` must come from `resolvePitchAngle`'s candidates, which are passed in.
- Stored on the lead, and regenerated when findings change.
- **`getLeadBrief(leadId)`** implements `SEAM-LEAD-BRIEF` exactly.

Evals: at least 8 cases per line: no invented facts, citations present, readable by a non-technical owner.

---

## Step 5: Cross-sell (`src/modules/acquisition/crosssell/`)

- **Detection** runs on `lead.scored` and on a periodic job. It finds companies with two or more open, qualified leads across lines, or signals carrying `crossLineHint`.
- **Grouping:**
  - Create or update a `CrossSellGroup`.
  - The **leading lead** is the one with the higher score. On a tie, the one whose line has more free capacity.
  - The other leads in the group are held: they stay `SCORED` but are flagged `heldByCrossSell: true`, so outreach never runs separate threads (invariant 9 is also enforced in the database).
- **`getCrossSellContext(leadId)`** implements `SEAM-CROSSSELL` exactly.
- **Services:**
  - `setLeadingLead(actor, groupId, leadId)`
  - `splitGroup(actor, groupId)`: allowed only if no thread is active
  - `listCrossSellOpportunities({ from, to, lines })`: for the Overview tab
- **Notifications:** notify the owners of all lines in the group once, when a group is created (a `crosssell.detected` notification type; export it).

---

## Step 6: Capacity throttling (`scoring/throttle.ts`)

**`getOutreachThrottle(line)`** implements `SEAM-THROTTLE` exactly, using `getLineCapacity(line)`:

| Load / capacity | Mode | Effect |
|---|---|---|
| Under 70% | `NORMAL` | The daily cap on new first touches comes from settings (default 30 per line per day) |
| 70–99% | `SLOW` | The cap drops to 30% of normal. Scheduled searches still run. |
| 100% or more | `PAUSED` | No new first touches. New qualified leads go to `NURTURE(capacity)`. **Conversations already under way continue.** |

All thresholds are settings. The profile's `capacityPolicy` can override them.

- `newFirstTouchesToday` counts approved first-touch messages today for the line. Read `Message` rows directly; they're shared data.
- **Release job:** when a line leaves `PAUSED`, move `NURTURE(capacity)` leads back to `SCORED` in score order, up to the day's cap. Notify the line owners.
- Emit `capacity.mode.changed`, and notify owners when a line enters `SLOW` or `PAUSED` (`capacity.line-full` already exists).

---

## Step 7: Calibration data

Provide `getScoreCalibrationData({ line, from, to })`. It returns score bands against outcomes (replied, meeting, won, lost), plus override counts. Phase 17 charts it, and the team uses it to tune profile rules.

---

## Step 8: Jobs, exports and services

- **Jobs:**
  - `acquisition.scoring.lead`
  - `acquisition.scoring.batch` (picks up `AUDITED` leads)
  - `acquisition.scoring.rescore-nightly`
  - `acquisition.crosssell.detect`
  - `acquisition.capacity.release`
- **Exports** (see the Wave 3 guide, B3): `scoringJobs`, `scoringSettings` (throttle thresholds, daily caps, what to do with low scores, the re-score age), `scoringSchedules`, `scoringNotifications`, and the AI tasks.
- **Services** for the UI:
  - `getLeadScore(leadId)`, with reasons, review and history
  - `rescoreLead(actor, leadId)`
  - `getThrottleStatus()`, for all lines
- Every mutation checks permission and is audited.

---

## Step 9: Tests

- **Unit tests:**
  - the rule parser and evaluator, for every condition type
  - clamping
  - band boundaries (39/40/60/61)
  - golden snapshots per line
  - the channel-check matrix
  - throttle modes at the exact thresholds
  - leading-lead selection
- **Integration tests** (test database, mocks, inline runner, controlled clock):
  - `AUDITED` becomes `SCORED`, `DISQUALIFIED` or `NURTURE` correctly
  - borderline creates a `ScoreReview` and is never auto-disqualified
  - an override is recorded
  - the brief cites only real findings
  - a cross-sell group holds the non-leading leads
  - `PAUSED` sends new leads to `NURTURE`, and release moves them back in score order
  - re-scoring on new findings
  - permissions
- **Evals** for both AI tasks.

---

## Constraints

- **Don't send or draft messages.** That's Phase 12.
- **Don't edit the manifest, schema, contracts or core transition table.** Raise requests.
- **No UI.**
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] The scoring engine is pure, deterministic and explainable, with golden tests per line.
- [ ] Qualification handles channels, disqualifiers, bands and capacity, with the correct transitions.
- [ ] The borderline review and lead brief tasks have evals. Overrides are recorded.
- [ ] Cross-sell detection, the leading lead and held leads work.
- [ ] The capacity throttle and release work.
- [ ] Calibration data is available.
- [ ] `getLeadBrief`, `getOutreachThrottle` and `getCrossSellContext` match the Wave 3 signatures exactly.
- [ ] `phases/11/REQUESTS.md` lists the exports and any transition, contract or schema requests.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings.
- [ ] `phases/11/SUMMARY.md` is written.
