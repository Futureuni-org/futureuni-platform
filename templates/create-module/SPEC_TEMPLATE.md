# <Module name>: module spec

Copy this file to `docs/specs/module-<id>.md` and fill it in with the saas-plan skill before building
(`docs/prompts/wave-5/adding-a-new-module.md`). Write every section; say "None" where one doesn't apply.

| | |
|---|---|
| Status | Draft |
| Module id | `<id>` (lower-case letters only; it prefixes every permission, job, task and event) |
| Route prefix | `/<id>` |
| Table prefix | `<prefix>_` (for example `mkt_` for Marketing) |
| Related | `docs/specs/platform.md`, `.claude/project-rules.md`, `docs/contracts/` |

## 1. Problem and goal

Who uses it, what job it does, and what "done" looks like.

## 2. Users and roles

What each role (ADMIN, MANAGER, SERVICE_LEAD, MEMBER) can do here.

## 3. Domain rules

The rules the module must never break, numbered so tests can cite them.

## 4. User stories and acceptance criteria

`US-n` stories, each with `AC-n.m` criteria written as Given / When / Then.

## 5. Data model

Every table (prefixed), field, index and constraint. Relate to the shared `Company` and `Contact`
only by foreign key. Personal data and its retention.

## 6. Page and route map

Every route under the prefix, its purpose, the permission it needs and its states.

## 7. API surface

Server actions, route handlers, webhooks and jobs, with inputs, outputs and permissions.

## 8. Permissions

Rows to add to the matrix in `.claude/project-rules.md` (`<id>.resource.verb`).

## 9. Jobs, events, notifications and settings

Job names (`<id>.job-name`), schedules, events published and consumed, notification types and
setting keys.

## 10. AI tasks

Task ids (`<id>.task-name`), tiers, inputs, outputs and evals.

## 11. Non-goals, risks and open questions

## 12. Phase plan

Waves of phases, like the acquisition module's, with seams between parallel phases.
