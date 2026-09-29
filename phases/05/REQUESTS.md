# Phase 05 — Change requests

Wave-1 integration (`docs/prompts/wave-1-prep-and-merge.md` Part C3) must apply each of these
after Phases 3 and 6 land on `main`.

## Seam wirings

### CR-05-01 — SEAM-AI-CREDENTIALS → `@/platform/credentials.getProviderKey` (Phase 6)

`src/platform/ai/_seams.ts` currently returns `env.ANTHROPIC_API_KEY` for the `"anthropic"`
provider. At merge, replace the stand-in with a call to Phase 6's credentials-vault reader:

```ts
// src/platform/ai/_seams.ts
import { getProviderKey as vaultGetProviderKey } from "@/platform/credentials";
export function getProviderKey(provider: ProviderKey): Promise<string | null> {
  return vaultGetProviderKey(provider);
}
```

Remove the fallback to `env.ANTHROPIC_API_KEY` from this file (env-based access moves into
the vault's own fallback path, INV-21).

### CR-05-02 — SEAM-SETTINGS-AI → `@/platform/settings.getAiSettings` (Phase 6)

Replace `_seams.ts:getAiSettings` with a settings-store read that returns the `AiSettings`
shape. Phase 6 must register these setting keys with the schemas exported from
`@/contracts/ai-service`:

- `ai.modelTiers` (`AiSettingsSchema.shape.modelTiers`)
- `ai.fallbackModels` (`AiSettingsSchema.shape.fallbackModels`)
- `ai.budgets.platformDailyUsd` / `.platformMonthlyUsd`
- `ai.budgets.perModuleDailyUsd`
- `ai.budgets.perUserDailyCalls`
- `ai.logContentOverrides`
- `platform.retention.aiContentDays` (default 30)

Each is ADMIN-only. Phase 5 has already documented these keys in `docs/specs/platform.md`.

### CR-05-03 — SEAM-PERMISSION → `@/platform/auth.assertActorCan` (Phase 3)

Replace `_seams.ts:assertActorCan` with the real permission-engine call. The stand-in allows
SYSTEM actors always and USER actors only when `role === "ADMIN"`; the real engine reads
the merged permission matrix from `.claude/project-rules.md`.

Phase 3 (or Phase 2's core-manifest permission registry, if that owns the list at merge
time) must register these actions:

- `platform.prompt.publish` — ADMIN only
- `platform.prompt.activate` — ADMIN only
- `platform.prompt.read` — ADMIN only
- `platform.aiUsage.read` — ADMIN only
- `platform.aiBudget.update` — ADMIN only
- `platform.eval.run` — ADMIN only

These are already reflected in the permission matrix in `.claude/project-rules.md`.

### CR-05-04 — SEAM-AUDIT → `@/platform/audit-log.recordAudit` (Phase 6)

Replace `_seams.ts:recordAudit` with the real audit-log writer. The stand-in already writes
directly to `AuditLog` with the exact column shape Phase 6's writer expects
(`actorType`/`actorId`/`actorLabel`/`action`/`targetType`/`targetId`/`before`/`after`),
so this is a symbol swap plus removing the local `Prisma.JsonNull` sentinel handling if
Phase 6's writer handles it differently.

### CR-05-05 — Notification-type registration (Phase 6)

Phase 5 emits two events via structured `console.warn` / `console.error` today (see
`src/platform/ai/quota.ts:reportBudgetSignal`). At merge, replace the stubs with
`@/platform/events.publish(…)` calls, and register these notification types with
`@/platform/notifications`:

- `ai.budget-warning` — in-app + email, critical=false, audience: admins
- `ai.budget-exceeded` — in-app + email, critical=true, audience: admins (cannot be muted)

Both are already listed in `docs/contracts/events.md` §3a.

## Dependencies

### CR-05-06 — Optional: bump `@anthropic-ai/sdk` to `^0.129.0` (Phase 1)

The SDK ships cache diagnostics on `Message.usage` as GA in 0.129 (they are behind a flag
in 0.128). The gateway works with 0.128 — this is a small quality-of-life bump. Phase 1
owns `package.json` deps outside the `alsoAllow` grant.

### CR-05-07 — Add `sharp` for vision downscaling (Phase 1)

`src/platform/ai/providers/anthropic.ts` accepts vision inputs and forwards them to the
API. Wave-1 does not downscale on the client side (the API accepts up to 1568 px longest
side); when Phase 10 introduces large audit captures, add `sharp` and downscale in the
adapter before sending. Optional until then.

## Doc updates

### CR-05-08 — ADR-018 minimum cache prefix is 512 tokens (Phase 0)

`docs/decisions.md` ADR-018 states Haiku 4.5's minimum cacheable prefix is 4096 tokens.
Verified against `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`
on 2026-09-29: current Claude 4.5/5.5 family caches from **512 tokens**. Suggest editing
ADR-018 at merge (Phase 0 owns `docs/decisions.md`).

### CR-05-09 — Model-ID default refresh in `.env.example` (Phase 1)

`.env.example` shows the older-generation defaults. The current-generation defaults
verified on 2026-09-29 are:

- `AI_MODEL_FAST=claude-haiku-4-5` ($1/$5 per MTok)
- `AI_MODEL_BALANCED=claude-sonnet-5-5` ($2/$10)
- `AI_MODEL_DEEP=claude-opus-5-5` ($4/$20)

Phase 1 owns `.env.example`; update at merge.

### CR-05-10 — Haiku 4.5 retirement watch (Phase 21)

Anthropic states Haiku 4.5 will not be retired sooner than **2026-10-15** (16 days after
this phase runs). Tier config already lives in settings/env, so the swap is a config
change plus an eval re-run — no code change. Flag for the launch-day runbook.

## Service gap / integration test coverage

### CR-05-11 — Integration tests to add once real seams land

Wave-1 relies on the 6-case eval suite for `platform.summarize-company` as the primary
end-to-end test. Once Phases 3 and 6 land the real seams, add explicit vitest
integration tests that exercise:

1. `runTask` writes exactly one `AiCall` row for each outcome (`OK`, `REPAIRED`,
   `INVALID`, `TIMEOUT`, `ERROR`, `QUOTA_BLOCKED`).
2. `publishPromptVersion` refuses regression without `force`; auditor row written.
3. `activatePromptVersion` flips `isActive` in one transaction; auditor row written.
4. Provider-key null path returns the mock even when `MOCKS=false`.

## Files changed under `FU_ALLOW_ALL=1`

None.
