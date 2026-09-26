# Lint fixtures

Deliberately broken files. `scripts/lint-rules.test.ts` lints them with the real `eslint.config.mjs` and checks that each project rule fires (P1-AC6). They are excluded from `pnpm lint`, `tsc` and Prettier. This folder is a small project root of its own (`src/`, `tsconfig.json`), so the path-based rules match exactly as they do in the real `src/`.
