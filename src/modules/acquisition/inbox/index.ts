/**
 * Public surface of the inbox area (Phase 13). Other phases (15/16 UI, 19 orchestration) import
 * services from here; the acquisition manifest imports the registration leaf files directly
 * (jobs.ts, settings.ts, …) to avoid a manifest ↔ registry import cycle, so those arrays are also
 * exported from their own files.
 */

import "server-only";

// Inbox services (Phase 16 UI + platform home)
export {
  listThreads,
  getThread,
  markRead,
  markUnread,
  getUnmatchedReplies,
  linkReply,
  getInboxCounts,
  type ListThreadsInput,
  type ThreadListItem,
} from "./services";

// Routing (assignment, snooze)
export { assignThread, snoozeThread } from "./routing/routing";

// Drafted responses + sending
export { generateReplyDraft, sendReply, type SendReplyInput } from "./draft/draft";

// Classification + processing (also used by tests and the integration flow)
export { processReply, reclassify } from "./actions/process";

// Assisted-channel replies
export { logAssistedReply, type LogAssistedReplyInput } from "./assisted";

// Ingestion (job entrypoint + test helpers)
export { pollAllMailboxes, ingestMailbox, matchInbound } from "./ingest/ingest";
export { enqueueMockReplies, resetMockReplies } from "./ingest/mock";

// AI tasks
export { inboxAiTasks, inboxClassifyTask, inboxDraftReplyTask, ensureInboxTasksRegistered } from "./tasks";

// Manifest registration arrays (also imported directly by the manifest).
export { inboxJobs } from "./jobs";
export { inboxSchedules } from "./schedules";
export { inboxSettings, INBOX_SETTING_KEYS, getInboxSetting } from "./settings";
export { inboxNotifications, INBOX_NOTIFICATION_TYPES } from "./notifications";
export { inboxSubscribers } from "./subscribers";
