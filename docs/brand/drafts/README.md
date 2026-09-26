# Brand files: drafts awaiting Prince's approval

Prepared 2026-09-26 from `docs/brand/futureuni-logo.png`, the only brand file supplied. **None of these is official until Prince approves it.** Once a file is approved, move it up to `docs/brand/` and update the "Logo assets" table in `.claude/project-rules.md`. Phase 4 then copies it into `public/brand/`.

| File | What it is | Confidence |
|---|---|---|
| `futureuni-mark.svg` | A **vector redraw of the existing mark**, in the colour sampled from the PNG (`#6C63E1`). Its geometry was measured from the PNG's edges: two identical L-shaped blocks, one rotated 180°, with an outer corner radius of about 91 and an inner fillet of about 95 in PNG pixels. An overlay test matched the original to within about 1px | High. It's the same mark, just crisp at any size. Approve unless the original artwork differs |
| `futureuni-mark-on-dark.svg` | The mark in brand **soft violet `#A89DF5`** for navy backgrounds | A proposal. The original colour also works on navy (3.79:1), but soft violet reads better (7.40:1) |
| `futureuni-mark-white.svg` | The mark in white, for photos and violet fills (6.96:1 on primary violet) | A proposal |
| `favicon.svg` | The mark centred on a square canvas. It switches to soft violet when the browser is in dark mode | A proposal; can generate the PNG/ICO icon set in Phase 4 |
| `futureuni-wordmark.svg` | "FUTUREUNI" set in **Bricolage Grotesque 600** (the display face chosen in ADR-014), letter-spacing 0.02em, deep navy `#0C1148`. The letters are converted to outlines, so no font is needed to display it | **A design proposal, not FUTUREUNI's official wordmark.** Replace it if an official one exists |
| `futureuni-lockup-horizontal.svg` | The mark plus the wordmark side by side, for light backgrounds | A proposal (depends on the wordmark) |
| `futureuni-lockup-horizontal-on-dark.svg` | The same lockup for dark backgrounds (soft violet mark, white text) | A proposal |

**Contrast** (graphics need 3:1 under WCAG 1.4.11):

| Colour | On white | On page background `#F6F6FB` | On navy surface `#0C1148` | On dark background `#060925` |
|---|---|---|---|---|
| `#6C63E1` (original mark) | 4.66:1 | 4.32:1 | 3.79:1 | 4.20:1 |
| `#A89DF5` (on-dark mark) | n/a | n/a | 7.40:1 | 8.20:1 |

**Notes:**
- **The mark's own colour (`#6C63E1`) isn't the brand primary (`#5342CC`).** It's a lighter violet. The drafts keep the logo's own colour. If you'd rather the mark used the primary violet, say so and the files are regenerated.
- **Bricolage Grotesque is licensed under the SIL Open Font License 1.1**, which allows using its outlines in a logo.
- **Rebuilding the files:** the generator script is not part of the repo (it lives in the Phase 0 session scratchpad). Phase 4 can rebuild these files from the measurements above if needed.
