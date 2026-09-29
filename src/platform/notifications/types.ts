/**
 * Platform notification types (`docs/contracts/events.md` §3a).
 *
 * These are registered on the core manifest by the Wave 1 integration; until then the runtime
 * merges them with anything modules add.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const platformNotificationTypes: readonly NotificationTypeDefinition[] = [
  { id: "review.queue-waiting", label: "Drafts waiting for review", description: "Outreach drafts need approval.", category: "product", defaultChannels: ["IN_APP"], critical: false, digestible: true },
  { id: "reply.interested", label: "Interested reply", description: "A prospect replied with interest.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: true, digestible: false },
  { id: "reply.needs-action", label: "Reply needs action", description: "A reply needs a response or a decision.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "meeting.booked", label: "Meeting booked", description: "A prospect booked a meeting with you.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "meeting.reminder", label: "Meeting reminder", description: "A meeting is starting soon.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "deal.won", label: "Deal won", description: "A deal was closed as won.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "deal.lost", label: "Deal lost", description: "A deal was closed as lost.", category: "product", defaultChannels: ["IN_APP"], critical: false, digestible: true },
  { id: "capacity.line-full", label: "Line at capacity", description: "A service line has reached capacity.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "job.failed", label: "Background job failed", description: "A background job failed its retries.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "integration.failing", label: "Integration failing", description: "An integration failed a health check.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "ai.budget-warning", label: "AI budget at 80%", description: "AI spend has reached 80% of the budget.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: false, digestible: false },
  { id: "ai.budget-exceeded", label: "AI budget reached", description: "AI spend has reached 100% of the budget.", category: "product", defaultChannels: ["IN_APP", "EMAIL"], critical: true, digestible: false },
  { id: "security.role-changed", label: "Your role changed", description: "An admin changed your role.", category: "transactional", defaultChannels: ["IN_APP", "EMAIL"], critical: true, digestible: false },
  { id: "security.2fa-reset", label: "Two-factor authentication reset", description: "Your 2FA was reset by an admin.", category: "transactional", defaultChannels: ["IN_APP", "EMAIL"], critical: true, digestible: false },
];
