/**
 * @/platform/notifications: in-app notifications and platform (transactional) email.
 *
 * SEAM-NOTIFICATIONS-SHELL wires the shell's bell to `listForUser`, `unreadCount`, `markRead`.
 * SEAM-AUTH-EMAIL wires Phase 3 auth flows to `sendEmail`.
 */

import "server-only";

export { notify, type NotifyInput, type NotifyResult } from "./notify";
export {
  getPreferences,
  listForUser,
  markRead,
  unreadCount,
  updatePreferences,
  type NotificationItem,
  type ListOptions,
  type PreferenceUpdate,
  type UserPreferences,
} from "./service";
export { sendEmail, type SendEmailInput } from "./email/send";
export { clearMockOutbox, getMockOutbox, isEmailLive, type EmailSender } from "./email/adapter";
export { routeEventToNotifications } from "./router";
export { getNotificationType, listNotificationTypes, _resetNotificationRegistry } from "./registry";
