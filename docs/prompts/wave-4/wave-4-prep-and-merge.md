# Wave 4: Prep and Merge Guide

Wave 4 builds every Client Acquisition screen, plus the platform settings and admin screens. Four phases run in parallel:

- **15** Module shell, search, saved searches and the review queue
- **16** Leads, lead detail, pipeline board and inbox
- **17** Analytics and the Overview tab
- **18** Admin and settings screens

Wave 3 must be merged, and its integration (Part C3 of `wave-3-prep-and-merge.md`) must have passed. **Every backend service these screens need already exists.** Wave 4 is presentation, interaction and a small amount of read-side aggregation (analytics).

---

## Part A: Before starting Wave 4 (on `main`)

### A1. Ownership map additions

On `main`, say to Claude Code:

> "Apply Part A1 of docs/prompts/wave-4-prep-and-merge.md, then run the ownership duplicate check."

Paths below are under `src/app/(platform)/acquisition/` unless they start with `src/`.

| Phase | Add to `owns` |
|---|---|
| 15 | `layout.tsx`, `page.tsx`, `[line]/layout.tsx`, `[line]/page.tsx`, `[line]/search/**`, `[line]/review/**`, `src/modules/acquisition/ui/shell/**`, `src/modules/acquisition/ui/search/**`, `src/modules/acquisition/ui/review/**` |
| 16 | `[line]/leads/**`, `[line]/pipeline/**`, `[line]/inbox/**`, `src/modules/acquisition/ui/leads/**`, `src/modules/acquisition/ui/pipeline/**`, `src/modules/acquisition/ui/inbox/**` |
| 17 | `[line]/analytics/**`, `overview/**`, `src/modules/acquisition/analytics/**`, `src/modules/acquisition/ui/analytics/**`, `runtime-skills/acquisition/analytics-*/**`, `evals/acquisition/analytics-*/**` |
| 18 | `[line]/settings/**`, `src/app/(platform)/settings/**`, `src/app/(platform)/admin/**`, `src/modules/acquisition/ui/settings/**`, `src/components/admin/**`. Also `alsoAllow: src/app/(auth)/**`, to restyle the auth pages with the shared components. |

### A2. Prompts and terminals

Copy `phase-15-module-shell.md`, `phase-16-leads-pipeline-inbox.md`, `phase-17-analytics.md`, `phase-18-admin-settings.md` and this file into `docs/prompts/`, then commit. Then:

```bash
pnpm phase start 15 module-shell
pnpm phase start 16 leads-pipeline-inbox
pnpm phase start 17 analytics
pnpm phase start 18 admin-settings
```

In each worktree, open Claude Code at maximum effort and in plan mode, then say:

> "Read docs/prompts/phase-NN-….md and execute it. Plan first."

---

## Part B: Shared agreements for Wave 4

### B1. The route map (fixed; every phase links using exactly these paths)

**Service-line slugs:**

| Slug | ServiceLine |
|---|---|
| `web-development` | `WEB_DEVELOPMENT` |
| `ui-ux-design` | `UI_UX_DESIGN` |
| `graphic-design` | `GRAPHIC_DESIGN` |
| `video-editing` | `VIDEO_EDITING` |

**Client Acquisition routes:**

| Route | Owner | Screen |
|---|---|---|
| `/acquisition` | 15 | Redirects to the user's first service line, or to `/acquisition/overview` for managers and admins |
| `/acquisition/overview` | 17 | Cross-line comparison |
| `/acquisition/[line]` | 15 | Redirects to `review` if the queue has items, otherwise to `search` |
| `/acquisition/[line]/search` | 15 | Search panel, live runs and history |
| `/acquisition/[line]/search/saved` | 15 | Saved searches |
| `/acquisition/[line]/search/import` | 15 | CSV import wizard |
| `/acquisition/[line]/search/runs/[runId]` | 15 | One search run |
| `/acquisition/[line]/review` | 15 | Review queue |
| `/acquisition/[line]/leads` | 16 | Leads list |
| `/acquisition/[line]/leads/[leadId]` | 16 | Lead detail (tabs set through `?tab=`) |
| `/acquisition/[line]/pipeline` | 16 | Pipeline board |
| `/acquisition/[line]/inbox` | 16 | Inbox (thread set through `?thread=<leadId>`) |
| `/acquisition/[line]/analytics` | 17 | Line analytics |
| `/acquisition/[line]/settings` | 18 | Line settings and profile editor (section set through `?section=`) |

**Platform routes:**

| Route | Owner | Screen |
|---|---|---|
| `/settings` | 18 | Personal: profile, notifications, appearance, security (2FA, sessions) |
| `/admin` | 18 | Admin home |
| `/admin/users` | 18 | Users and invites |
| `/admin/team` | 18 | Team and capacity |
| `/admin/integrations` | 18 | Credentials and provider tests |
| `/admin/mailboxes` | 18 | Mailboxes and sending domains |
| `/admin/suppression` | 18 | Suppression list |
| `/admin/data-requests` | 18 | Data-subject requests |
| `/admin/prompts` | 18 | Prompt versions |
| `/admin/ai-usage` | 18 | AI usage and cost |
| `/admin/jobs` | 18 | Job runs and schedules |
| `/admin/audit` | 18 | Audit log |
| `/admin/platform` | 18 | Platform settings and modules |

### B2. Seam

| Seam ID | Stand-in (consumers) | Provider | Signature |
|---|---|---|---|
| `SEAM-LINE-CONTEXT` | Phases 16, 17, 18: `<ui folder>/_seams.ts` | Phase 15: `@/modules/acquisition/ui/shell` | `resolveLine(slug: string): { line: ServiceLine; slug: string; label: string; accentToken: string } \| null`, `lineHref(line: ServiceLine, section?: string, query?: Record<string, string>): string` and `LINE_SLUGS: Record<ServiceLine, string>`. The stand-in implements the B1 slug table. |

Until Phase 15 merges, pages owned by 16, 17 and 18 render inside the platform shell without the service-line tab header. **That's expected.** They must render their own `PageHeader` (from Phase 4) and must not build their own tab bar.

### B3. The UI quality bar (every Wave 4 phase must meet all of it)

1. **Build from Phase 4.** Read `phases/04/SUMMARY.md` ("How to build a screen") and use the primitives, patterns, charts and motion tokens from `src/components/**` and `src/lib/motion.ts`.
   - Module-specific composites go in your own `src/modules/acquisition/ui/<area>/` folder.
   - **Don't create new generic primitives.** If one is genuinely missing, build it locally in your folder and list it in `REQUESTS.md` as a candidate to promote into `src/components`.
2. **The saas-ui philosophy and finish checklist.** No boxes in boxes, no card grids of identical tiles, tokens only, sentence case, mono only for data, Lucide icons only, zero emoji.
3. **Every screen has loading (skeletons that match the layout), empty (with a primary action), error (with retry) and no-permission states.**
4. **Responsive from 375 to 1440 with no horizontal overflow.** Tables become card lists below `md`. Boards scroll with snap on mobile. Multi-pane screens become drill-down navigation on mobile.
5. **Light (the default) and dark** are both correct.
6. **Accessibility:** keyboard reachable, visible focus, labels, `aria-live` for async results, AA contrast, 48px targets. **Zero serious or critical axe violations.**
7. **Server-first:**
   - React Server Components call the services directly after `requireUser` or `requirePermission`
   - mutations use the existing Zod-validated server actions
   - no client fetch waterfalls
   - Suspense streaming for slow panels
   - cursor pagination
8. **Filters, sorts, tabs and selected items live in the URL** (nuqs), so every view can be shared.
9. **Permission-aware UI.** Hide actions the user can't take, or disable them with a tooltip explaining why. The server still enforces every rule.
10. **Optimistic updates** where they make an interaction feel instant (approve, move card, mark read), with rollback and an error toast on failure.
11. **Motion with purpose:** list reorder and filter animations, card moves, panel transitions, number counters. All respect reduced motion.
12. **Keyboard shortcuts** for high-frequency screens (review queue, inbox, pipeline), registered through Phase 4's `useShortcut` and listed in the "?" overlay. Register command-palette actions through Phase 4's `registerCommand`.
13. **Copy:** plain, confident, specific. Money through the `Money` component (₦ / $ / £ / €, never summed across currencies). Times through `RelativeTime`, in the viewer's timezone.
14. **Visual review with Playwright MCP.** For every screen you build, capture 375 and 1440, in light and dark, using the seeded data. Review the captures critically against this bar, fix what's off, and list what you changed in your summary.
15. **Tests:**
    - component tests for complex interactive pieces
    - Playwright end-to-end tests for each screen's main flow in `tests/e2e/phase-NN/`, on desktop and mobile
    - axe on every screen in both themes

---

## Part C: After all four phases finish

### C1. Check each phase

Run `pnpm phase finish <nn>` in each worktree.

### C2. Merge in this order

Merge **15 → 16 → 17 → 18**, running `pnpm install`, `registry:gen` and `pnpm check` after each one.

### C3. The Wave 4 integration session

On `main`, say:

> "Read docs/prompts/wave-4-prep-and-merge.md Part C3 and do it."

The session must:

1. Read `phases/15..18/SUMMARY.md` and `REQUESTS.md`.
2. Connect `SEAM-LINE-CONTEXT` everywhere, delete the stand-ins, and confirm `grep -r "SEAM:" src` returns nothing.
3. **Check every link against the B1 route map.** Write a small test that crawls every navigation entry and every `lineHref` call site, and asserts there are no 404s for each role.
4. **Promote candidate primitives** listed in the `REQUESTS.md` files into `src/components` where two or more phases built similar ones, and replace the duplicates.
5. Update the acquisition manifest navigation (section badges and counts) to match the final screens, and register the Phase 17 jobs and settings.
6. **Visual consistency pass with Playwright MCP.** Capture every screen at 375 and 1440, in light and dark, as each role. Fix inconsistencies between phases: spacing rhythm, header patterns, empty-state tone, badge usage.
7. **Write and run `tests/e2e/wave-4.spec.ts`:** for one line in each market, as a `SERVICE_LEAD`:
   - run a search and watch the leads arrive
   - open the review queue, approve a draft with the keyboard, and prepare and mark a WhatsApp send
   - open the lead and see its evidence
   - a scripted reply arrives in the inbox; reply with the AI draft
   - move the card to meeting booked, then create and send a proposal, then mark it won
   - the analytics show the change
   - as `ADMIN`: publish a profile edit, test an integration, add a suppression, view AI cost
8. Run axe on every route, in both themes, for each role.
9. Run `pnpm check` and `pnpm test:e2e`, then `saas-review`.
10. Write `phases/wave-4-integration/SUMMARY.md`.

**When C3 passes, Wave 5 (Phases 19–21) can start.**
