/**
 * Public surface of the outreach area (Phase 12). Other phases import services from here; the
 * acquisition manifest imports the registration leaf files directly (jobs.ts, settings.ts, …) to
 * avoid a manifest ↔ registry import cycle, so those arrays are also exported from their own files.
 */

import "server-only";

// Drafting
export { createDraft, ensureOutreachTasksRegistered } from "./draft/draft";
export type { CreateDraftInput, CreateDraftResult } from "./draft/draft";
export { outreachAiTasks, outreachDraftTask, outreachDraftEditTask } from "./draft/tasks";

// Review and approval
export {
  approveMessage,
  autoApproveIfEligible,
  countReviewQueue,
  countReviewQueueForUser,
  editMessage,
  getReviewQueue,
  getReviewQueueForUser,
  regenerateMessage,
  rejectMessage,
  snoozeLead,
  streamDraftEdit,
} from "./review/review";
export type { ReviewQueueItem, GetReviewQueueInput } from "./review/review";
export { proposeEnrollment } from "./review/propose";

// Sequences (provided seams + tick)
export { enroll } from "./sequences/enroll";
export { stopEnrollments, pauseEnrollment, resumeDuePausedEnrollments } from "./sequences/stop";
export { runOutreachTick, dispatchDueSends } from "./sequences/tick";

// Email (single send path + provided seams)
export { sendEmailMessage } from "./email/send";
export type { SendOutcome } from "./email/send";
export { sendOneOffEmail } from "./email/send-oneoff";
export { recordBounce } from "./email/bounces";

// Mailboxes and domains
export {
  addMailbox,
  updateMailbox,
  pauseMailbox,
  listActiveMailboxes,
  getMailboxHealth,
} from "./mailboxes/mailboxes";
export { evaluateMailboxHealth, evaluateAllMailboxHealth } from "./mailboxes/health";
export { checkDomainDns } from "./mailboxes/dns";
export type { DnsCheckResult } from "./mailboxes/dns";

// Assisted channels
export { prepareWhatsApp, prepareLinkedIn, createCallTask, markAssistedSent } from "./assisted/assisted";
export { buildWhatsAppLink } from "./assisted/links";

// Unsubscribe
export { processUnsubscribe } from "./unsubscribe/unsubscribe";
export { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe/tokens";

// Manifest registration arrays (also imported directly by the manifest).
export { outreachJobs } from "./jobs";
export { outreachSchedules } from "./schedules";
export { outreachSettings, OUTREACH_SETTING_KEYS, getOutreachSetting } from "./settings";
export type { UnsubscribeScope } from "./settings";
export { outreachNotifications } from "./notifications";
export { outreachSubscribers } from "./subscribers";
