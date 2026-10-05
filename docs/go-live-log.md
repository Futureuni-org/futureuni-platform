# Go-live log

A dated record of switching each real provider on (Phase 21 Step 4) and of the launch itself. Fill in as you go. Never record secret values — only names, dates, outcomes and costs.

## Provider switch-on (one at a time, in production)
For each: add the credential in `/admin/integrations`, run **Test connection**, run the smallest real operation, check the result + cost.

| Order | Provider | Date | Test connection | Smallest real op | Cost observed | Notes |
|---|---|---|---|---|---|---|
| 1 | Anthropic | | | one `platform.summarize-company` call | | |
| 2 | Google Places | | | 1 search/line/market, `limit: 3` | | |
| 2 | SerpAPI | | | " | | |
| 2 | Adzuna | | | " | | |
| 2 | YouTube Data | | | " | | |
| 2 | Apple App Store | | | " | | |
| 3 | Hunter | | | enrich those leads | | |
| 3 | Companies House | | | " | | |
| 4 | PageSpeed | | | audit those leads | | |
| 4 | Browser runtime | | | audit + check screenshots | | |
| 5 | Resend | | | invite a teammate | | |
| 6 | Calendar (Cal.com) | | | book a test meeting, watch the webhook | | |
| 7 | Outreach mailboxes + inbound | | | send to internal test addresses only; check threading, footer, one-click unsubscribe (real Gmail + Outlook), reply ingested + classified | | |

**After switch-on:** compare the real per-lead cost with `docs/cost-model.md` and update the model.
Measured per-lead cost to review: ____ (vs ~$0.13 est.).

## Inbox-placement tests (warm-up)
| Date | Domain / mailbox | Tool | Score | Notes |
|---|---|---|---|---|
| | | mail-tester-style | | |

## Launch record
| Item | Value |
|---|---|
| Launch checklist fully ticked (date) | |
| Prince's go-ahead (date) | |
| Kill switch turned off (date/time) | |
| First lines live (one per market) | |
| All lines live (date) | |
| Two-week review complete (date) | |
