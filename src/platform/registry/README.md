# src/platform/registry/

**Owner: Phase 02 (Core schema and registry).** The module registry (Phase 2): `pnpm registry:gen` finds every `src/modules/*/manifest.ts` and writes `generated.ts`, the one platform file allowed to import modules. `registry.ts` exposes navigation, permissions, jobs, settings panels and home widgets from it.
