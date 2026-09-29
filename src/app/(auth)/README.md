# `src/app/(auth)/` — Phase 3

Sign-in pages outside the platform shell. Phase 3 ships the on-brand split layout with local primitives in `_components/`. Phase 18 restyles them with shared components (behaviour unchanged) — this is `alsoAllow` in `scripts/ownership/ownership.json`.

Routes:

- `/login` — email + password (React Hook Form on the client, server action on submit).
- `/login/2fa` — TOTP + backup-code verification.
- `/invite/[token]` — accept an invite (name + password); the token's presence is validated server-side before the form renders.
- `/reset` — request a reset link; always says "If that account exists…" to avoid enumeration.
- `/reset/[token]` — set a new password.
- `/setup-2fa` — QR + verify + backup codes (shown once).
- `/signed-out` — post-sign-out confirmation.

Every form:

- uses semantic tokens only (no raw colours, no default Tailwind palette classes).
- has 48px fields, inline `aria-live="polite"` errors, visible focus ring, and `autocomplete` set correctly.
- honours the `next` parameter through `safeNext()` — same-origin relative paths only.
