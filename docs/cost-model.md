# Cost model (Phase 20)

An estimate of the per-lead and monthly running cost of the FUTUREUNI acquisition platform. **Every figure marked _(est.)_ is an assumption to replace with a measured value** from the AI-call logs (`AiCall.costMicros`), the provider-usage counters (`ProviderUsage`), and the Vercel/Neon bills once the platform runs on real volume. Internal cost accounting is integer micro-USD (`costMicros`, ADR-027) and is never shown as client money (INV-11).

> This is a planning model, not a bill. Numbers are order-of-magnitude. Confirm before committing to budgets.

## 1. Cost per lead reaching review

A lead that flows to a first-touch draft passes through enrich → audit → score+brief → draft. The AI + provider cost per stage _(est.)_:

| Stage | Calls | Model tier | Unit cost _(est.)_ | Per lead _(est.)_ |
|---|---|---|---|---|
| Enrichment | 1–2 AI (extract people / pick contact), fast tier; + 1 crawl/finder provider call | fast | $0.002/AI call; provider ~$0 (own crawl) / $0.01 (Hunter-style) | ~$0.01 |
| Audit | 1–4 AI (by line; web = first-impression + heuristics vision; graphic/video similar), balanced tier, some with vision; + PageSpeed/YouTube/Places calls | balanced (+vision) | $0.02/AI call; PageSpeed free tier, YouTube/Places ~$0.005 | ~$0.08 |
| Scoring + brief | 1 brief (fast) + occasional borderline review (balanced) | fast/balanced | $0.004/AI call | ~$0.01 |
| First-touch draft | 1 draft (balanced) + at most 1 repair | balanced | $0.02/AI call | ~$0.03 |
| **Total per lead to review** | | | | **≈ $0.13 _(est.)_** |

Notes:
- Only **qualified** leads reach the draft stage; disqualified/nurtured leads stop earlier and cost less (enrichment + partial audit only, ≈ $0.05 _(est.)_).
- Vision audits (web/graphic/video first-impression) dominate the AI cost; prompt caching of the system prompt and downgrading tasks to the fast tier where evals show no loss materially reduces this — record before/after once evals run.
- Nigeria vs International: similar AI cost; International adds a little more audit cost (more web-heavy lines).

## 2. Blended cost per line (assuming a 3:1 found:qualified funnel)

If ~3 leads are sourced per lead that reaches review, blended cost ≈ 2×$0.05 (dropped) + 1×$0.13 (to review) ≈ **$0.23 per sourced lead _(est.)_**, or **≈ $0.13 per lead to review**. Web Development and UI/UX run slightly higher (vision-heavy audits) than Graphic/Video.

## 3. Monthly cost at three volumes

Fixed platform + per-lead variable. Fixed costs _(est.)_: Vercel Pro ~$20/user or ~$20 base; Neon ~$19 (scale plan); Resend ~$20; Google Workspace outreach mailboxes ~$7/mailbox × N. Variable = sourced-lead cost (AI + providers).

| Leads/month (to review) | Sourced (≈3×) | Variable (AI+providers) _(est.)_ | Fixed _(est.)_ | **Monthly total _(est.)_** |
|---|---|---|---|---|
| 200 | ~600 | ~$140 | ~$120 | **≈ $260** |
| 1,000 | ~3,000 | ~$690 | ~$150 | **≈ $840** |
| 5,000 | ~15,000 | ~$3,450 | ~$250 | **≈ $3,700** |

Assumptions: variable scales ~linearly with sourced leads at ~$0.23 _(est.)_ each; fixed grows slowly (more mailboxes + Neon/Vercel usage at higher volume). Anthropic is the dominant variable cost; the AI budget caps (platform daily/monthly, per-module, per-user, per-task) bound the worst case.

## 4. Controls that bound cost (verified in code)
- **AI budgets** (`src/platform/ai/quota.ts`): platform daily + monthly, per-module daily, per-user daily — a call at the limit is blocked with `AI_QUOTA_EXCEEDED`; an 80% warning fires.
- **Per-lead caps**: sourcing provider cost cap (`sourcing/budget.ts`); audit per-lead cost cap (`audits` settings); enrichment finder caps.
- **Model tiers + prompt caching** (ADR-018): cacheable system prompts are cached; tasks run at the cheapest tier evals allow.

## 5. Production defaults (to set before launch — see hardening report)
Set conservative launch budgets in the bootstrap settings, e.g. _(est., confirm)_: platform daily $20 / monthly $300; per-user daily $5; per-task max tokens per the task config. Revisit after the first month of real `AiCall` data.

## 6. Measure these to replace the estimates
`AiCall.costMicros` grouped by task (the real per-call cost), `ProviderUsage` (Places/PageSpeed/Hunter/YouTube counts × their price), the Vercel + Neon + Resend + Workspace invoices, and the actual found:qualified funnel ratio from the analytics `leads_found` / `qualification_rate` metrics.
