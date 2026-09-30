# `src/styles/` — design tokens and global styles

**Owner: Phase 04 (Design system and shell).** Values come from `.claude/project-rules.md` §"Brand and UI"; this folder is their runtime home. Changing a listed value needs a new contrast check and a REQUESTS.md entry.

- `tokens.css` — the only file with raw colour values. Light on `:root`, dark on `[data-theme="dark"]`. Also carries service-line accent tokens (`--accent-web`, `--accent-uiux`, `--accent-graphic`, `--accent-video`) and sequential/diverging chart stops (`--seq-primary-1..5`, `--seq-accent-1..5`, `--div-1..5`).
- `globals.css` — Tailwind CSS 4 and the `@theme inline` mapping into utility classes (`bg-surface`, `text-muted`, `ring-focus`, `shadow-lift`, …). The single `.reading-rule` utility ships the Editorial Ledger signature detail.
- `fonts.ts` — Bricolage Grotesque (display), Instrument Sans (UI), JetBrains Mono (data) through `next/font` (ADR-014).

## Contrast table

Every pair below was checked with the WCAG relative-luminance formula and copied from project-rules §"Brand and UI". Body-text pairs pass 4.5:1; boundaries, focus rings and chart marks pass 3:1. Ratios were last re-verified on 2026-09-29.

The full 34-row table lives in `.claude/project-rules.md` §"Brand and UI". Highlights that Phase 4 relies on:

| Pair | Light | Dark |
|---|---|---|
| `foreground` on `background` | 13.25:1 | 16.80:1 |
| `foreground` on `surface` | 14.27:1 | 15.16:1 |
| `heading` on `surface` | 17.66:1 | 17.66:1 |
| `muted` on `surface` | 5.78:1 | 8.02:1 |
| `primary-foreground` on `primary` | 6.96:1 | 7.40:1 |
| `primary` on `surface` (links) | 6.96:1 | 7.40:1 |
| `ring` on `surface` (focus) | 6.96:1 | 7.40:1 |
| `success` on `surface` | 5.34:1 | 9.21:1 |
| `warning` on `surface` | 6.21:1 | 9.96:1 |
| `danger` on `surface` | 5.78:1 | 7.86:1 |

Chart series 3 (`#C27A0E`) and series 8 (`#5E9A2F`) sit at the 3:1 floor on light surfaces — they satisfy the boundary contrast rule but **must never carry text** (project-rules explicitly bans this). `chart-theme.ts` uses them for fills only, and every chart carries a `<details>` data-table fallback for the readable values.

## Service-line accents

Derived from the categorical palette so tabs, badges and charts share one colour per line (see `src/lib/chart-theme.ts` `SERVICE_LINE_ACCENT_INDEX`).

| Line | Light | Dark |
|---|---|---|
| WEB_DEVELOPMENT | `#5342CC` (chart-1) | `#A89DF5` |
| UI_UX_DESIGN | `#8A5CC9` (chart-6) | `#D59CF0` |
| GRAPHIC_DESIGN | `#C27A0E` (chart-3) | `#F0B34A` |
| VIDEO_EDITING | `#2F7FD0` (chart-5) | `#6FAEF2` |

Each accent is used only as a **thin indicator** (tab underline, badge dot, series fill). It's never the primary colour of a button or a large fill — that role stays with the shared `--primary`.

## Chart palette derivation

- **Categorical** (`--chart-1..8`): eight hand-picked colours from project-rules, alternating warm and cool so neighbouring series stay distinct.
- **Sequential — primary**: 5-stop OKLCH-style ramp from `--primary-soft` to `--primary` in light; from `--primary-soft` (dark) to `--primary` (dark) with a violet mid-tone in dark mode.
- **Sequential — accent**: 5-stop ramp from soft violet to heading navy.
- **Diverging**: `--danger → --warning → neutral → --success (soft) → --success`. The neutral stop matches the current theme's `--zone` so the middle band recedes.

`src/lib/chart-theme.ts` exports `chartPalette`, `chartSeries`, `chartSequential`, `chartDiverging`, `chartAxes`, `chartTooltip` and `serviceLineAccent`. The dataviz-skill validator isn't run locally (skill not installed); when it is, the derivation above should score at least the same as project-rules' hand-picked table.

## The Editorial Ledger signature — the "reading rule"

A single 2px-wide, `h-5` (20px) tall vertical rule appears to the left of the currently focused / active row, nav item, kanban card or review card. In light mode it uses `var(--primary)`; in dark mode `var(--accent)`. The `.reading-rule` utility class in `globals.css` renders it as an `::before` pseudo-element so a component just adds a data-attribute and the visual is consistent everywhere.

```html
<li data-reading-rule="active" class="peer relative pl-4">…</li>
```

Never used decoratively — only to say "this is where you are" or "this is what's active".
