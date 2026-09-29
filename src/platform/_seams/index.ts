/**
 * Wave 1 seams (`docs/prompts/wave-1/wave-1-prep-and-merge.md` Part B).
 *
 * What Phase 6 CONSUMES (stand-ins here, replaced at merge with the real code):
 *  - SEAM-PERMISSION → `@/platform/auth` (`assertCan`, `assertActorCan`)
 *
 * What Phase 6 PROVIDES to other phases (their stand-ins are replaced at merge):
 *  - SEAM-AUDIT           → `@/platform/audit-log` (`audit.record`, `withAudit`)
 *  - SEAM-AUTH-EMAIL      → `@/platform/notifications` (`sendEmail`)
 *  - SEAM-AI-CREDENTIALS  → `@/platform/credentials` (`getCredential`)
 *  - SEAM-SETTINGS-AI     → `@/platform/settings` (`getSetting`)
 *  - SEAM-NOTIFICATIONS-SHELL → `@/platform/notifications` (`listForUser`, `unreadCount`, `markRead`)
 *
 * Signatures match the wave-1 seam table exactly; the wiring change is in `phases/06/REQUESTS.md`.
 */

export { assertCanSeam } from "./permission";
