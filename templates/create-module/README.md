# templates/create-module/

**Owner: Phase 02 (Core schema and registry).** The module skeleton behind `pnpm create-module <id> "<Name>"` (Phase 2). The generator copies it into `src/modules/<id>/` and `src/app/(platform)/<id>/`, replaces tokens such as `__MODULE_ID__`, then runs `registry:gen`; the manifest it produces must pass `docs/contracts/module-manifest.md`.
