# src/platform/registry/

**Owner: Phase 02 (Core schema and registry).** The module registry: every module declares itself in
`src/modules/<id>/manifest.ts`, and the platform learns about it only through here.

| File | What |
|---|---|
| `define.ts` | `defineModule`, `defineJob` (parses input with the job's schema before `run`, `entry` and `idempotencyKey`), `defineSetting` (checks the default), `permission`, `scopes`. Manifests import from here, not from the index |
| `validate.ts` | `validateManifests`: every rule in `docs/contracts/module-manifest.md` (unique ids, route prefixes inside the module and not reserved, unique actions, jobs, schedules, settings, notification types and widgets, valid cron and timezones, known Lucide icons, registered permissions) |
| `codegen.ts` | `pnpm registry:gen` finds `src/modules/*/manifest.ts`, validates them with the core manifest and writes `generated.ts` (only if changed). `--check` fails when it's stale (CI) |
| `generated.ts` | Generated: the one platform file allowed to import modules |
| `core-manifest.ts` | The platform itself (`platform`): Home, Settings, Admin and every `platform.*` permission |
| `registry.ts` | The runtime API: `getAllModules`, `getEnabledModules`, `getNavigation(user)`, `getAllPermissions`, `getAllJobs`, `getCronSchedules`, `getDynamicScheduleProviders`, `getSettingDefinitions`, `getSettingsPanels`, `getHomeWidgets`, `getNotificationTypes`, `getCommands`, `getAllAiTasks`, `getAllSubscribers`, `resolveBadge` |
| `create-module.ts` | `pnpm create-module <id> "<Name>"` copies `templates/create-module/`, runs `registry:gen` and prints the next steps |

Navigation hides items the user can't access and parents left empty. An item without a service
line shows when the action is allowed on any line (so the acquisition Overview shows for a
service lead). A module is enabled unless the PLATFORM setting `module.<id>.enabled` is false.

`registry.test.ts` parses the permission matrix in `.claude/project-rules.md` and checks the core
and acquisition manifests register exactly its actions and scopes.
