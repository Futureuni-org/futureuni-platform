# src/platform/\_seams

Wave 1 seam stand-ins (`docs/prompts/wave-1/wave-1-prep-and-merge.md` Part B). Each file carries a
`// SEAM:<ID>` marker and is deleted at merge, when the caller is re-pointed to the real code.

## What Phase 6 CONSUMES

| Seam ID           | Stand-in                       | Real (from Phase 3)                    |
|-------------------|--------------------------------|----------------------------------------|
| SEAM-PERMISSION   | `permission.ts` `assertCanSeam`| `@/platform/auth` `assertCan`/`assertActorCan` |

## What Phase 6 PROVIDES for other phases' seams

| Seam ID                    | Real (from Phase 6)                            | Signature |
|----------------------------|------------------------------------------------|-----------|
| SEAM-AUDIT                 | `@/platform/audit-log` `audit.record`          | `(tx: Tx | null, entry: AuditEntry) => Promise<{ id: string }>` |
| SEAM-AUTH-EMAIL            | `@/platform/notifications` `sendEmail`         | `({ to, template, props, dedupeKey? }) => Promise<{ jobRunId: string }>` |
| SEAM-AI-CREDENTIALS        | `@/platform/credentials` `getCredential`       | `(provider: ProviderId) => Promise<CredentialPayload | null>` (or `resolveProviderKey` for string keys) |
| SEAM-SETTINGS-AI           | `@/platform/settings` `getSetting`             | `(key: string, opts?: { userId? }) => Promise<T>` |
| SEAM-NOTIFICATIONS-SHELL   | `@/platform/notifications` `listForUser`, `unreadCount`, `markRead` | as documented in `notifications/service.ts` |

Every signature matches the wave-1 seam table exactly; the wiring change for each is listed in
`phases/06/REQUESTS.md`.
