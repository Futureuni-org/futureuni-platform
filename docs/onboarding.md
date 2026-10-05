# Team onboarding

How to use the FUTUREUNI platform, by role. Short and practical. _Screenshots are captured from the staging data (`pnpm seed:staging`) via the browser once the app is running — placeholders marked `[screenshot: …]` below._

## Everyone (first sign-in)
1. Open the invite link, set a password. **Admins must set up 2FA** on first sign-in. `[screenshot: sign-in + 2FA]`
2. The home page shows **My review queue**, **My inbox**, **Pipeline value**, **Needs you** and recent activity — your day at a glance. `[screenshot: home]`
3. Set your timezone and working hours in `/settings` (send windows and relative times use them).
4. **Never:** buy or import purchased contact lists; cold-email UK sole traders or partnerships; send outreach from outside the platform; paste secrets into chat. The platform enforces these, but don't try to work around them.

## Member (works their own leads)
- **Review queue** (`/acquisition/<line>/review`): approve, edit or reject the AI-drafted first touch. Keyboard shortcuts: `j`/`k` move, `a` approve, `e` edit, `r` reject (full list under the `?` overlay). Every claim must cite a finding — you can't approve an uncited draft. `[screenshot: review queue]`
- **WhatsApp / assisted send:** for Nigeria first touches, the platform prepares the message and a `wa.me` link — you click **Prepare**, send it yourself from WhatsApp, then **Mark sent**. Nothing is sent automatically on WhatsApp/LinkedIn. `[screenshot: assisted panel]`
- **Inbox** (`/acquisition/<line>/inbox`): replies are classified (Interested, Not now, Wrong person, Out of office, Unsubscribe, Bounce). Reply with the AI-suggested draft (includes the booking link). Watch the SLA badges. `[screenshot: inbox thread]`
- **Pipeline** (`/acquisition/<line>/pipeline`): drag cards between stages; record meeting outcomes; build and send proposals (priced by the system — you can't change the numbers). `[screenshot: pipeline board]`

## Service Lead (owns a line)
- Everything a Member does, plus: **run searches** and manage **saved searches** (`/acquisition/<line>/search`); assign leads; manage cross-sell groups.
- **Profiles** (`/acquisition/<line>/settings`): edit as a **draft**, **preview**, then **publish**; **roll back** if needed. Exactly one version is active. Keep pricing real (clear `needsReview`) and portfolio items non-placeholder. `[screenshot: profile editor]`
- **Analytics** (`/acquisition/<line>/analytics`): leads found, funnel rates, reply and meeting rates, cost per lead.
- Set your line's **capacity** (`/admin/team`) so throttling is accurate.

## Manager (all lines)
- All operational rights across lines; approve outreach/proposal exceptions; see all analytics; retry/cancel jobs; manage team capacity; invite users at Manager or below.
- The **Overview** (`/acquisition/overview`) compares lines. Watch capacity, bounce rates and the review-queue backlog.

## Admin (platform)
- Users/roles/invites (`/admin/users`), team (`/admin/team`), credentials (`/admin/integrations`), mailboxes + DNS (`/admin/mailboxes`), suppression (`/admin/suppression`), data requests (`/admin/data-requests`), prompts (`/admin/prompts`), AI usage + budgets (`/admin/ai-usage`), jobs (`/admin/jobs`), audit log (`/admin/audit`), platform settings + modules (`/admin/platform`).
- **The global outreach kill switch** lives in `/admin/platform` (`acquisition.outreach.globalPause`). Use it the moment outreach misbehaves. It is ON until launch.
- Day one: set AI budgets (`docs/cost-model.md`), confirm every integration is green, watch `/admin/jobs` for the schedule.

See `docs/runbook.md` for operations and `docs/launch-checklist.md` for go-live.
