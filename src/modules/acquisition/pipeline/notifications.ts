/**
 * Pipeline notification types (Phase 14). Added to the acquisition manifest by Phase 19 through
 * `phases/14/REQUESTS.md`, and to `docs/contracts/events.md` §3a in the same change.
 *
 * `meeting.booked`, `meeting.reminder`, `deal.won` and `deal.lost` are platform types already
 * registered by Phase 6 (`src/platform/notifications/types.ts`); the pipeline only emits the events
 * / calls `notify` for them, it doesn't redefine them here.
 */

import type { NotificationTypeDefinition } from "@/contracts/module-manifest";

export const PIPELINE_NOTIFICATION_TYPES = {
  precallReady: "precall.ready",
  proposalApprovalNeeded: "proposal.approval-needed",
  proposalExpired: "proposal.expired",
  handoffAssigned: "handoff.assigned",
  leadStale: "lead.stale",
  leadReengageDue: "lead.reengage-due",
  noteMentioned: "note.mentioned",
} as const;

export const pipelineNotificationTypes: NotificationTypeDefinition[] = [
  {
    id: PIPELINE_NOTIFICATION_TYPES.precallReady,
    label: "Pre-call brief ready",
    description: "A pre-call brief has been generated for an upcoming meeting.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: false,
    digestible: false,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.proposalApprovalNeeded,
    label: "Proposal needs approval",
    description: "A proposal's discount or total is outside the allowed range and needs a manager's approval.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: false,
    digestible: false,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.proposalExpired,
    label: "Proposal expired",
    description: "A sent proposal reached its validity date without a response.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.handoffAssigned,
    label: "Handoff assigned to you",
    description: "A won deal's delivery work has been assigned to you.",
    category: "product",
    defaultChannels: ["IN_APP", "EMAIL"],
    critical: false,
    digestible: false,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.leadStale,
    label: "Lead has gone stale",
    description: "A lead has had no activity for longer than its stage allows.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.leadReengageDue,
    label: "Lost lead back in nurture",
    description: "A lost lead's re-engagement date has arrived and it has returned to nurture.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
  {
    id: PIPELINE_NOTIFICATION_TYPES.noteMentioned,
    label: "You were mentioned in a note",
    description: "A teammate mentioned you in a note on a lead.",
    category: "product",
    defaultChannels: ["IN_APP"],
    critical: false,
    digestible: true,
  },
];
