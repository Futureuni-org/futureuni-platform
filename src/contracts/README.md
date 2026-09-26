# src/contracts/

**Owner: Phase 02 (Core schema and registry).** The interfaces between parts, transcribed from
`docs/contracts/*.md` into TypeScript and Zod 4 without redesign. Import from `@/contracts` (or a
single file, `@/contracts/<name>`).

| File | From |
|---|---|
| `common.ts` | Enums (re-exported from the generated Prisma enums), ids, money, cost, actors, errors, pagination, JSON |
| `permissions.ts` | Roles, scopes, permission definitions and subjects |
| `jobs.ts` | Job definitions, schedules, enqueue options, run counts and progress |
| `events.ts` | Domain events (every name in `docs/contracts/events.md`) and notification data |
| `ai-service.ts` | AI tasks, usage, content logging, citation markers |
| `module-manifest.ts` | Module manifests, navigation, settings, widgets, the registry API |
| `service-line-profile.ts` | The service-line profile and its parts |
| `source-adapter.ts`, `enrichment.ts`, `audit-agent.ts`, `outreach-channel.ts`, `acquisition-records.ts` | The acquisition seams and typed JSON columns |

Rules:

- Contracts hold types, schemas and constants only; implementations live elsewhere. The one
  runtime import from `src/lib` is `common.ts` re-exporting `AppErrorCode`, `APP_ERROR_STATUS` and
  `ActionResult`, so there's a single error map. The money helpers (`formatMoney`, `toMinor`,
  `fromMinor`) are in `src/lib/money.ts`.
- Enums come only from `@/generated/prisma/enums`, never the Prisma client.
- A change to a contract goes through the owning phase's `REQUESTS.md` and `docs/contracts/` first.
- Each contract has a test: its worked example parses, its invalid example fails at the documented
  paths, and `types.test.ts` pins the key types.
