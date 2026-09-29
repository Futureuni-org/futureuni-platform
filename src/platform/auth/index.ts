/**
 * The single import point for authentication and authorization (docs/specs/platform.md §7).
 * Every downstream service, RSC and route handler uses this file.
 */

import "server-only";

export type { CurrentUser } from "./session";
export {
  getCurrentUser,
  requireUser,
  requireRole,
  requirePermission,
  canFromUser,
} from "./session";
export { can, assertCan, assertActorCan, explainCan, actorOf } from "./permissions";
export { auth } from "./auth";
export { safeNext } from "./redirect";
export { checkPassword, PASSWORD_MIN_LENGTH } from "./password";
