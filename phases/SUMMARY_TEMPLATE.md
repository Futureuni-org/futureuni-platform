# Phase <nn>: <name>: Summary

<!--
Copy to phases/<nn>/SUMMARY.md when the phase finishes. Fill every section. Write "None." rather than deleting a section.
Later phases read this file instead of your code, so be exact: real paths, real function names, real commands.
-->

| | |
|---|---|
| Phase | <nn>, <name> |
| Branch | `phase/<nn>-<slug>` |
| Batch / wave | B<n> / Wave <n> |
| Date finished | YYYY-MM-DD |
| Prompt | `docs/prompts/<path>` |
| Verification | `pnpm check`: Pass/Fail · `pnpm test:e2e`: Pass/Fail/Not run (reason) · `saas-review`: no open Critical/Major |

## What was built

Two to six sentences: what now exists and works, in plain words, plus the acceptance criteria it meets (quote the IDs, for example `M8-AC3`).

## Files and folders created

| Path | Purpose |
|---|---|
| `src/...` | ... |

## Public interfaces other phases can use

For every export another phase may call: its import path, signature, one-line behaviour and any permission it checks. Include jobs, events emitted, settings keys, notification types, AI tasks and routes.

```ts
// @/modules/acquisition/<area>
export async function exampleService(actor: Actor, input: ExampleInput): Promise<ExampleOutput>;
```

## Decisions made (and any new ADRs proposed)

- Decision and its reason.
- Proposed ADR: title, context, decision, reason. It's added to `docs/decisions.md` at merge through `REQUESTS.md`.

## Dependencies added

| Package | Version | Why |
|---|---|---|
| ... | ... | ... |

## Change requests raised

A summary of `phases/<nn>/REQUESTS.md`: ID, type (schema, contract, doc, ownership, seam wiring, setting, service gap), and a one-line summary.

**Seams:** for each seam in the prompt, whether it was **stubbed** (the provider was running in parallel; the wiring change is in REQUESTS.md) or **real** (the provider was already merged on `main`).

## Known limitations

What doesn't work yet, what was deliberately left out, placeholders (with who must confirm them), and technical debt.

## How to test it

The exact commands, the seeded users or data to use, and the manual steps to see it working (URLs, roles, expected results).
