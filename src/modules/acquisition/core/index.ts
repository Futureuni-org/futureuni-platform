/**
 * @/modules/acquisition/core: the acquisition rules every phase shares. The lead state machine
 * (INV-1, INV-15) and the suppression check (INV-2).
 */

export {
  canTransition,
  isOpenLeadStatus,
  LEAD_ACTIVE_STATUSES,
  LEAD_CLOSED_STATUSES,
  LEAD_PRE_CONTACT_STATUSES,
  LEAD_TERMINAL_STATUSES,
  LEAD_TRANSITIONS,
  NURTURE_REASONS_FROM,
  leadEventActor,
  recordLeadCreation,
  transitionLead,
  type TransitionLeadInput,
  type TransitionLeadResult,
} from "./lead-state";
export {
  assertNotSuppressed,
  findSuppressions,
  hashSuppressionValue,
  isSuppressed,
  normalizeSuppressionValue,
  type SuppressionCheck,
  type SuppressionMatch,
} from "./suppression";
