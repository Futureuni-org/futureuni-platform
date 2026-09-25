# Phase 4: Design System and App Shell

> **How to run this phase**
> 1. Wave 0 must be merged, and Part A of `wave-1-prep-and-merge.md` must be done.
> 2. Run `pnpm phase start 04 design-system`, then open Claude Code in the new worktree folder. Use Opus at maximum effort and switch to plan mode.
> 3. Say: **"Read docs/prompts/phase-04-design-system.md and execute it. Plan first."**
> 4. **In the plan, Claude will present two visual directions. Choose one before approving.**
>
> Wave 1. Runs in parallel with Phases 3, 5 and 6. Depends on Phases 0–2.

---

## Your role and the goal of this phase

You are the design engineer who gives the FUTUREUNI Internal Platform its look, feel and structure, following the `saas-ui` skill. Every screen built in Phases 15–18, and every future module (Marketing and beyond), will be assembled from what you make here. So this phase decides whether the platform feels like a **finished, distinctive product** or a generic dashboard.

**You deliver:**

1. The final **token system** in light (the default) and dark.
2. A complete **component library** and **pattern library**.
3. The **platform shell:**
   - sidebar and module switcher, driven by the module registry
   - top bar
   - command palette
   - notification bell
   - user menu with the theme toggle
   - mobile navigation
4. The **platform home** page.
5. A **chart theme** and chart components.
6. **Motion tokens** and interaction patterns.
7. A **living UI gallery** at `/dev/ui` that shows every component and pattern in both themes, with realistic FUTUREUNI content.

**The session and notifications are stand-ins** until Phases 3 and 6 are merged (see the seams in Step 7).

---

## Step 0: Read first

1. `CLAUDE.md`
2. `.claude/project-rules.md`, especially "Brand and UI" (the palette, the token table with contrast ratios, typography, bans)
3. `docs/specs/platform.md`: the shell, the platform home, core routes, and every screen state
4. `docs/specs/module-acquisition.md`: skim the screens (tabs, review queue, pipeline, inbox, analytics), so the component library covers what they'll need
5. `docs/contracts/module-manifest.md` and `src/platform/registry/`
6. `src/styles/` (the tokens Phase 1 seeded), `src/app/layout.tsx` and `src/lib/theme.ts`
7. `phases/README.md`, `phases/00..02/SUMMARY.md` and the seams in `docs/prompts/wave-1-prep-and-merge.md`
8. The global skill **`saas-ui` in full, including `references/motion.md`, `references/patterns.md`, `references/dashboards.md` and `references/three-d.md`**
9. The **`dataviz`** skill, for the chart theme
10. `saas-testing` and `saas-review`

Use Context7 for the current docs of Tailwind, Motion, Radix UI primitives (or the shadcn-style approach saas-ui prescribes), cmdk, TanStack Table, nuqs (URL state), sonner (toasts) and your chart library. Use the **Playwright MCP** throughout to open the running app at 375, 768, 1024 and 1440 widths, in light and dark, and look at your work.

---

## What you own

- `src/styles/**`
- `src/components/ui/**`
- `src/components/patterns/**`
- `src/components/charts/**`
- `src/components/shell/**`
- `src/lib/motion.ts`
- `src/lib/chart-theme.ts`
- `src/app/layout.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
- `src/app/(platform)/layout.tsx` and `src/app/(platform)/page.tsx` (the home)
- `src/app/(platform)/dev/**`
- `phases/04/**`

---

## Step 1: Choose the visual direction (in the plan, before building)

The brand palette is:

| Name | Hex |
|---|---|
| Primary violet | `#5342CC` |
| Soft violet | `#A89DF5` |
| Deep navy | `#0C1148` |
| Ink | `#232849` |
| Muted | `#5D6486` |
| Lavender tint | `#E3E4F5` |

The typefaces are the ones recorded in the decisions log.

The platform must **not** look like a generic AI SaaS. That rules out:

- purple gradient washes
- identical card grids
- cards inside cards
- a bordered box around every section
- emoji
- the default shadcn look with the colours swapped

**In your plan, propose two distinct visual directions.** For each, give:

- a name and a one-paragraph concept
- how it uses navy, lavender and violet
- the type treatment (display versus UI face, scale, where the mono face appears)
- the shell treatment (sidebar style, top bar)
- how data-dense screens (tables, pipeline) feel
- **one signature detail** that makes the platform recognisable

Examples of signature details:

- a thin violet "signal line" motif that marks live or active items
- editorial numerals for key metrics
- a navy command rail with lavender content zones
- evidence chips styled like annotations

Describe both directions in words, plus a quick ASCII sketch of the home and a data table. **Wait for my choice,** then record it in `phases/04/SUMMARY.md` and raise a request to add it as an ADR.

Both directions must respect the light-first rule: light is the default and dark is fully designed as layered navy depth, not an inversion.

---

## Step 2: Token system (`src/styles/`)

Refine the tokens Phase 1 seeded into the complete system saas-ui describes:

- **Colour:**
  - background, surface, zone, elevated
  - foreground, muted, subtle
  - primary, primary-foreground, primary-soft, accent
  - border (nearly invisible), input, ring
  - success, warning, danger, info, each with a soft variant
  - overlay
  - selection
  - chart series 1–8, plus sequential and diverging scales from the dataviz skill

  Every text/background pair must pass WCAG AA. Keep a contrast table in `src/styles/README.md`.
- **Service-line accent tokens:** one restrained accent per service line (web development, UI/UX, graphic design, video editing), derived from the palette and used for tab indicators, badges and chart series. Include light and dark values, AA-checked.
- **Type scale:**
  - fluid `clamp()` sizes: display-xl, display, h1–h4, body-lg, body, body-sm, caption, eyebrow
  - line heights and letter spacing per step
  - the mono face used for data only (tabular numbers)
- **Space:** a 4/8pt scale. **Radius:** a scale. **Shadows:** `soft` and `lift` for both themes. Dark shadows are about depth, not black blur.
- **Motion** in `src/lib/motion.ts`, per `saas-ui/references/motion.md`:
  - durations 100/150/250/400/600ms
  - standard, emphasised and exit easings
  - snappy, gentle and bouncy springs
  - a `useReducedMotionSafe()` hook
  - `LazyMotion` setup
- **Theme toggle:** light, dark or system. The saved choice is applied before paint (Phase 1's script). Build the toggle UI.

---

## Step 3: Component library (`src/components/ui/`)

Build accessible primitives using the approach saas-ui prescribes (shadcn-style on Radix). Every component:

- is typed
- uses tokens only
- works in both themes
- has visible focus states
- meets 48px touch targets where interactive
- supports `className` merging with `cn`

**Required components:**

- **Actions:** Button (primary, secondary, ghost, danger, link; sizes; loading state; icon-only with required `aria-label`), IconButton, ButtonGroup, SplitButton.
- **Inputs:**
  - Input
  - Textarea (auto-grow)
  - Select
  - Combobox (searchable, multi-select)
  - Checkbox, Radio group, Switch
  - Slider (for score thresholds)
  - DatePicker and DateRangePicker (timezone-aware display)
  - Currency input (minor units in, formatted out; NGN, USD, GBP, EUR)
  - Tag input
  - File dropzone
- **Form system:** `Form`, `FormField`, `FormLabel`, `FormDescription` and `FormMessage` wired to React Hook Form and Zod. Sectioned forms with no outer card. Sticky actions on mobile.
- **Display:**
  - Badge
  - StatusBadge, driven by **one status-meta map** covering every `LeadStatus`, `MessageStatus`, `ReplyClass` and `JobStatus` (label, tone, icon)
  - ServiceLineBadge and MarketBadge (Nigeria or International, plus a country code)
  - Avatar and AvatarGroup
  - Tooltip
  - Kbd
  - Separator
  - ScoreMeter (0–100, with a reason list on hover or focus)
  - EvidenceChip (a finding claim plus its source link, styled per your signature detail)
  - Money (formats minor units and currency)
  - RelativeTime (with the absolute time on hover, in the viewer's timezone)
- **Overlays:**
  - Dialog
  - AlertDialog (for destructive confirmations)
  - Sheet (a side panel; a full-height drawer on mobile)
  - Popover
  - DropdownMenu
  - ContextMenu
  - Toasts (sonner themed)

  Overlays use `shadow-lift` with no border.
- **Navigation:** Tabs (including service-line tabs with accent indicators), Breadcrumbs, Pagination (cursor-based), SegmentedControl (for the market toggle).

---

## Step 4: Pattern library (`src/components/patterns/`)

These patterns carry the most weight. Phases 15–18 will build screens almost entirely from them.

- **PageHeader:**
  - eyebrow, title and description
  - primary and secondary actions
  - a tabs slot and a breadcrumbs slot
- **Section:** spacing-based grouping. No borders.
- **StatRow:**
  - 2-up on mobile, 4-up on desktop
  - mono numbers
  - trend delta
  - optional sparkline
  - no cards
- **DataTable** (TanStack Table):
  - column definitions
  - sorting, filtering and selection
  - bulk-action bar
  - column visibility
  - sticky header
  - row click to a detail Sheet
  - density toggle
  - **automatic card or list rendering below `md`**
  - filters and sort stored in the URL (nuqs)
  - cursor pagination
  - skeleton, empty and error states built in
- **FilterBar:**
  - search
  - faceted filters (service line, market, status, owner, score range, date range)
  - saved filter chips
  - all in URL state
- **KanbanBoard** for pipelines:
  - columns by stage
  - drag and drop with keyboard support and a screen-reader announcement
  - column totals (count and value)
  - layout animation on move
  - horizontal scroll with snap on mobile
- **DetailLayout:**
  - a main column plus a side rail (key facts, owner, score, actions)
  - an activity timeline component (events with icons, actor, relative time)
  - it collapses to one column on mobile
- **Timeline/ActivityFeed**, used for lead events and audit logs.
- **ConversationThread,** for the inbox: messages, direction, channel icon, classification badge, and a composer slot.
- **ReviewCard:** a large focused review unit showing the company, the audit evidence and the drafted message side by side, with keyboard shortcuts for approve, edit, reject and skip. This pattern is the heart of the review queue.
- **Wizard/Stepper,** for multi-step setup flows.
- **States:**
  - `Skeleton` variants that match each pattern's layout
  - `EmptyState` (illustration-free: strong type, one line of help, a primary action)
  - `ErrorState` (message, retry, and a details disclosure)
  - `PermissionState` ("You don't have access to this")
  - `OfflineBanner`
- **CommandPalette** (cmdk):
  - opens with Cmd/Ctrl+K
  - groups: Navigate (from `getNavigation`), Actions (registered by modules through a small client registry you create: `registerCommand({ id, label, group, shortcut, perform, permission })`), Recent, Theme
  - fuzzy search
  - fully keyboard driven
- **Keyboard shortcuts:** a tiny shortcuts system (`useShortcut`) plus a "?" overlay that lists the shortcuts available on the current screen.

---

## Step 5: Charts (`src/components/charts/`, `src/lib/chart-theme.ts`)

Follow the **dataviz** skill: form heuristics, the colour formula and validator, mark specs, and interaction rules.

- **Pick one chart library** (for example Recharts or visx) and justify it.
- **`chart-theme.ts`** maps the tokens to series, sequential and diverging scales for both themes. Run the dataviz skill's validator on the palette and record the result.
- **Components:**
  - LineChart and AreaChart (time series with range selection)
  - BarChart (grouped or stacked, horizontal option)
  - FunnelChart (the pipeline stages)
  - Sparkline
  - Donut (only if the dataviz skill allows it for a use case; otherwise leave it out)
  - Heatmap (reply rate by weekday × hour)
  - ComparisonBars (service lines side by side)
- **Every chart has:**
  - accessible labels
  - a data-table fallback
  - a keyboard-focusable tooltip
  - a loading skeleton
  - an empty state
  - correct light and dark rendering

---

## Step 6: The platform shell (`src/components/shell/`, `src/app/(platform)/layout.tsx`)

- **Desktop sidebar:**
  - collapsible (icons only when collapsed), with the state remembered
  - FUTUREUNI logo, using the right variant per theme
  - **module switcher** at the top, listing enabled modules from `getEnabledModules()`
  - the active module's navigation tree from `getNavigation(user)`, with nested service-line tabs for Client Acquisition
  - active states use your signature detail
- **Top bar:**
  - breadcrumbs
  - command palette trigger (showing the shortcut)
  - notification bell with unread count and a panel (`SEAM-NOTIFICATIONS-SHELL`)
  - user menu: name, role, theme toggle, keyboard shortcuts, sign out
- **Mobile:**
  - a bottom navigation with at most 5 items (Home, the active module's key sections, Search/Command, Menu)
  - the full navigation in a Sheet
- **Page transitions:** subtle route transitions, with reduced-motion fallbacks.
- **Guards:** the layout calls `getShellSession()` (`SEAM-AUTH-SHELL`). If it returns `null`, redirect to `/login`. Navigation is filtered through the session's permission check.
- **Route loading and errors:** a `loading.tsx` using shell-matched skeletons, and an `error.tsx` using `ErrorState`, for the `(platform)` group.

---

## Step 7: Seams (fixed signatures, stand-ins in your own folder)

```ts
// src/components/shell/session.ts   (server-only)
// SEAM:SEAM-AUTH-SHELL
export type ShellSession = {
  user: { id: string; name: string; email: string; image: string | null; role: Role; serviceLines: ServiceLine[]; timezone: string };
  can: (action: PermissionAction, resource?: PermissionResource) => boolean; // server-side only; never passed to client components
};
export async function getShellSession(): Promise<ShellSession | null>;
```

The stand-in returns a mock user chosen by the `MOCK_SESSION_ROLE` env variable (default `ADMIN`), with a simple role-based `can` that approximates the matrix. At merge, it's replaced with `getCurrentUser()` and `can()` from `@/platform/auth`. **Compute everything permission-based on the server** and pass plain data (the filtered navigation, flags) to client components.

```ts
// src/components/shell/notifications-source.ts   (server-only)
// SEAM:SEAM-NOTIFICATIONS-SHELL
export type ShellNotification = { id: string; type: string; title: string; body: string | null; link: string | null; createdAt: string; readAt: string | null };
export async function getShellNotifications(userId: string, opts?: { limit?: number }): Promise<{ items: ShellNotification[]; unread: number }>;
export async function markShellNotificationsRead(userId: string, ids: string[] | "all"): Promise<void>; // server action wrapper
```

The stand-in reads the seeded `Notification` rows directly (read-only). Marking as read is a no-op that updates local state.

Write each seam's wiring change in `phases/04/REQUESTS.md`.

---

## Step 8: The platform home (`src/app/(platform)/page.tsx`)

The first screen after sign-in. It shows the user's own work across modules:

- **A greeting line** in display type, with the user's name and today's date in their timezone.
- **"Needs you":** counts that link through (review queue, unread replies, meetings today, overdue follow-ups).
- **Home widgets from every enabled module's manifest** (`getHomeWidgets()`). Build the widget frame and a registry that maps widget IDs to components. For now, render the acquisition placeholder widgets ("My review queue", "My inbox", "Pipeline value") with seeded data read directly from the database, read-only. Phase 19 connects them to real module services.
- **Recent activity:** audit events relevant to the user.

It must feel like a considered editorial dashboard, not a grid of boxes. Include loading, empty (a new user with no assignments) and error states.

---

## Step 9: The living UI gallery (`/dev/ui`)

- A route group of pages that shows **every** component, pattern, chart and state.
- Each has a light/dark switch and a viewport-width switch, with **realistic FUTUREUNI content**:
  - Lagos restaurants, UK agencies and YouTube creators as companies
  - audit findings like "Homepage takes 7.2s to load on mobile"
  - money in ₦ and £
- Include a full-page composite mock of an acquisition screen (for example a service-line tab with a PageHeader, market toggle, StatRow, FilterBar and DataTable) to prove the pieces compose into a finished screen.
- Visible to `ADMIN` only in production, and to everyone in development.

---

## Step 10: Tests and quality

- **Component tests** (Testing Library) for:
  - Button loading/disabled states
  - Form errors
  - Combobox
  - CurrencyInput (minor-unit conversion)
  - StatusBadge covering every status value
  - DataTable sorting, filtering and selection
  - KanbanBoard keyboard move
  - CommandPalette open, search and run
- **Accessibility:** add `@axe-core/playwright` and run axe on every `/dev/ui` page in both themes. **Zero serious or critical violations.**
- **Playwright,** in `tests/e2e/phase-04/`:
  - the shell renders with the mock session
  - the sidebar collapses
  - the module switcher lists modules from the registry
  - the command palette navigates to an acquisition tab
  - the theme toggle persists across reload with no flash
  - at 375px there's no horizontal overflow on any `/dev/ui` page, the bottom navigation works, and the DataTable renders as cards
- **Visual check with Playwright MCP:** capture the home and three gallery pages at 375 and 1440 in both themes. Look at them critically against the saas-ui finish checklist, fix what's off, and describe what you changed in your summary.
- **Performance:**
  - charts and heavy components are lazy-loaded
  - `LazyMotion` is used
  - no layout shift on the shell
  - check bundle impact

---

## Constraints

- **Don't import Phase 3, 5 or 6 code.** Use the seams.
- **Tokens only.** No raw colours outside `src/styles/` and `chart-theme.ts`. No default Tailwind palette classes.
- **Zero emoji.** Lucide icons only.
- **No 3D** unless your chosen direction has a genuinely purposeful use. If it does, follow `saas-ui/references/three-d.md` strictly (lazy-loaded, poster fallback, reduced-motion static frame, budget under 2MB) and keep it out of data screens.
- **Never commit or merge** unless I ask.

---

## Done when

- [ ] I chose a visual direction in the plan, and it's recorded.
- [ ] The token system is complete in light and dark, with the AA contrast table, service-line accents and chart palettes validated with the dataviz method.
- [ ] Every component in Step 3 and every pattern in Step 4 exists, is typed, accessible and responsive, and is shown in `/dev/ui` with realistic content.
- [ ] The shell works: sidebar, module switcher and navigation from the registry, top bar, command palette, notification bell, user menu with theme toggle, mobile bottom navigation.
- [ ] The platform home works with all its states.
- [ ] Both seams have stand-ins with the fixed signatures and `// SEAM:` markers. `phases/04/REQUESTS.md` lists the wiring and the ADR request for the visual direction.
- [ ] axe reports zero serious or critical issues, there's no overflow at 375px, and the Playwright tests pass.
- [ ] `pnpm check` passes.
- [ ] `saas-review` is clean of Critical and Major findings, including the saas-ui finish checklist.
- [ ] `phases/04/SUMMARY.md` is written. It includes a "How to build a screen" guide: which patterns to use for a list page, a detail page, a board, an inbox and an analytics page. Phases 15–18 will follow it.
