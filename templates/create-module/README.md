# templates/create-module/

**Owner: Phase 02 (Core schema and registry).** The module skeleton behind `pnpm create-module <id> "<Name>"`
(`src/platform/registry/create-module.ts`).

| Template | Becomes |
|---|---|
| `module/**/*.tpl` | `src/modules/<id>/**` (manifest, README, `core/` with a repo and a test, `ui/`, `jobs.ts`, `seed.ts`) |
| `app/page.tsx.tpl` | `src/app/(platform)/<id>/page.tsx` |
| `SPEC_TEMPLATE.md` | Copied by hand to `docs/specs/module-<id>.md` |

Template files end in `.tpl`, so TypeScript and ESLint skip them here. The generator replaces these
tokens: `__MODULE_ID__` (the id, lower-case letters), `__MODULE_NAME__`, `__ROUTE_PREFIX__` (`/<id>`)
and `__MODULE_COMPONENT__` (the id in PascalCase). The manifest it produces passes
`docs/contracts/module-manifest.md`, and the generated module passes lint, typecheck and build as is.
