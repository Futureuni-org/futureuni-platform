# Phase 04 change requests

Each entry describes a change that lives outside `src/styles/**`, `src/components/{ui,patterns,charts,shell}/**`, `src/lib/{motion,chart-theme}.ts`, `src/app/(platform)/{layout,page,loading,error}.tsx`, `src/app/{layout,global-error,not-found}.tsx`, `src/app/(platform)/dev/**`, `public/brand/**`, `phases/04/**`, `tests/e2e/phase-{01,04}/**` or `pnpm-lock.yaml`. Applied at the Wave-2 batch B2 integration.

---

## CR-04-01 · Runtime dependencies for the design system

- **Kind:** dependency addition (Phase 1 owns `package.json`).
- **Motivation:** The Editorial Ledger design system is built on shadcn-style primitives over Radix, with `motion/react` already installed. The shell needs a command palette (cmdk), toasts (sonner), a mobile drawer (vaul), a chart library (recharts), a data-grid (TanStack Table), URL state (nuqs), and drag-and-drop (dnd-kit).
- **What to change at merge:** the exact deltas below (all pinned to caret-range versions verified working with Next 16 / React 19). `pnpm-lock.yaml` on this branch already carries the resolved graph, so the merge just needs the `package.json` additions.

```jsonc
// package.json dependencies additions
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^10.0.0",
"@dnd-kit/utilities": "^3.2.2",
"@radix-ui/react-accordion": "^1.2.20",
"@radix-ui/react-avatar": "^1.2.6",
"@radix-ui/react-checkbox": "^1.3.11",
"@radix-ui/react-collapsible": "^1.1.20",
"@radix-ui/react-context-menu": "^2.3.7",
"@radix-ui/react-dialog": "^1.1.23",
"@radix-ui/react-dropdown-menu": "^2.1.24",
"@radix-ui/react-popover": "^1.1.23",
"@radix-ui/react-radio-group": "^1.4.7",
"@radix-ui/react-scroll-area": "^1.2.18",
"@radix-ui/react-select": "^2.3.7",
"@radix-ui/react-separator": "^1.1.15",
"@radix-ui/react-slider": "^1.4.7",
"@radix-ui/react-switch": "^1.3.7",
"@radix-ui/react-tabs": "^1.1.21",
"@radix-ui/react-toggle-group": "^1.1.19",
"@radix-ui/react-tooltip": "^1.2.16",
"@radix-ui/react-visually-hidden": "^1.2.11",
"@tanstack/react-table": "^9.2.4",
"cmdk": "^1.1.1",
"nuqs": "^2.10.1",
"recharts": "^3.10.1",
"sonner": "^2.0.8",
"vaul": "^1.1.2",

// package.json devDependencies additions
"@axe-core/playwright": "^4.13.0",
```

Rationale for each choice:
- **Recharts** over visx: mature SVG API, native React 19 support, tree-shakable per-chart imports; and the size cost is acceptable at 60 KB gzipped.
- **cmdk** for the command palette: the reference implementation in the React ecosystem, used by Vercel and Linear.
- **sonner**: the smallest toast library that ships styled + accessible primitives; theming is by tokens.
- **vaul**: bottom-sheet UX for mobile, ships accessibility for touch drag.
- **@tanstack/react-table** v9: headless; controlled sort/filter/select fit the DataTable pattern.
- **nuqs**: type-safe URL state; the DataTable and FilterBar patterns depend on it.
- **@dnd-kit** core+sortable+utilities: keyboard-friendly drag-and-drop for the KanbanBoard pattern; a11y-first.

## CR-04-02 · Ownership: grant Phase 4 `alsoAllow` on `package.json`

- **Kind:** ownership map addition (Phase 1 owns `scripts/ownership/ownership.json`, Phase 0 owns `CLAUDE.md`).
- **What to change at merge:**
  1. In `scripts/ownership/ownership.json`, phase `"04"`: add `"package.json"` to `alsoAllow` (already staged on this branch).
  2. In `CLAUDE.md`'s "Created by one phase, owned by another, and other grants" table: extend the `package.json` grant row to include Phase 4 (already staged on this branch), noting the design-system runtime deps.
- **Motivation:** matches the pattern Phases 5, 6 and 7 already have. The B1 pattern for `qrcode.react` (revert + REQUESTS.md) doesn't scale to the ~28 deps this phase needs — the phase code doesn't compile without them.

## CR-04-03 · Visual-direction ADR

- **Kind:** decision record (Phase 0 owns `docs/decisions.md`).
- **What to change at merge:** add ADR-036 "Editorial Ledger visual direction" with the following body:

  > **Context:** Phase 4 must pick a visual direction the platform will grow into. Two candidates were proposed to the owner; the chosen one is recorded here.
  >
  > **Decision:** Editorial Ledger. The platform reads like a curated editorial atlas of the business — generous vertical rhythm, ambitious display type sets the pace, data cells sit in typographic tables rather than card grids. Signature detail: a 2px violet "reading rule" marks the currently focused / active row, nav item, card. Sequential and diverging chart scales derive from the palette; service-line accents come from the categorical `chart-1..8` tokens (WEB → 1, UI/UX → 6, GRAPHIC → 3, VIDEO → 5).
  >
  > **Consequences:** No card-in-card layouts. No purple gradients. No emoji. Sections separated by space and typographic hierarchy, not borders. The `reading-rule` utility (`src/styles/globals.css`) is the single place the signature is implemented.

## CR-04-04 · Documentation of the "How to build a screen" guide

- **Kind:** already in this phase's `SUMMARY.md` §"How to build a screen"; noted here for the log so Phases 15–18 can find it.

## CR-04-05 · Remove `MOCK_SESSION_ROLE` from `.env.example`

- **Kind:** environment schema (Phase 1 owns `.env.example` and `src/env.ts`).
- **Motivation:** the SEAM-AUTH-SHELL stand-in this variable powered is gone (Phase 3 and 6 are merged; Phase 4's shell calls `@/platform/auth.getCurrentUser` directly).
- **What to change at merge:** remove the `MOCK_SESSION_ROLE` declaration from `.env.example` and the corresponding `MOCK_SESSION_ROLE` schema entry in `src/env.ts`.

## CR-04-06 · Phase 7 widget registration

- **Kind:** coordination note (Phase 7 owns the acquisition manifest).
- **Motivation:** Phase 4 ships placeholder acquisition widgets (`acquisition.review-queue`, `acquisition.inbox`, `acquisition.pipeline-value`) in `src/components/shell/home/widget-registry.ts` because Phase 7 hadn't merged yet. When Phase 7 lands, its manifest should register these widget ids so `getHomeWidgets()` returns them and Phase 4's registry lookup wires them up automatically.

## CR-04-07 · Ownership grants already applied

The current diff also updates `scripts/ownership/ownership.json` (phase 04 `alsoAllow` gains `package.json`) and `CLAUDE.md` (grant table extended to include Phase 4). These edits are outside Phase 4's owned paths and were made under `FU_ALLOW_ALL=1` because they enable CR-04-01. Documented here for the merge session's log.
