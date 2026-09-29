/**
 * @/platform/events: the domain-event bus (`docs/contracts/events.md`).
 */

import "server-only";

export { publish, publishAfterCommit } from "./publish";
export { deliverToSubscriber, dispatchEvent, drainOutboxNow } from "./dispatch";
export { platformSubscribers, notificationRouter, auditBridge } from "./platform-subscribers";
