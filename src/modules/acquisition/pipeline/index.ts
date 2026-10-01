/**
 * `@/modules/acquisition/pipeline` — the public surface of the pipeline area (Phase 14): board,
 * meetings, proposals, deals and handoff, plus the revenue data services for Phase 17.
 *
 * The registration arrays (`pipelineJobs`, `pipelineSchedules`, `pipelineSettings`,
 * `pipelineNotificationTypes`, `pipelineTasks`) are wired onto the acquisition manifest by Phase 19
 * from their leaf files (`./jobs`, `./schedules`, …), never from this barrel, to avoid the AI
 * registry import cycle.
 */

import "server-only";

// Board + pipeline moves
export {
  getPipeline,
  moveLead,
  setNextAction,
  getOverdueNextActions,
  nurtureLead,
  reengageLead,
  runStaleCheck,
  type MoveLeadInput,
  type PipelineBoard,
  type PipelineCard,
  type PipelineColumn,
  type PipelineQuery,
} from "./board/board";
export { addLeadNote, listLeadNotes } from "./board/notes";

// Meetings (getBookingLink implements SEAM-BOOKING-LINK)
export {
  getBookingLink,
  createMeeting,
  handleCalendarBooking,
  recordMeetingOutcome,
  regeneratePrecallBrief,
  generateDuePrecallBriefs,
  sendDueMeetingReminders,
} from "./meetings/meetings";
export { getCalendarProvider } from "./meetings/calendar";
export { buildBookingUrl, signLeadRef, verifyLeadRef } from "./meetings/booking-link";

// Proposals
export { priceProposal, effectiveDiscountBps, type PricedProposal } from "./proposals/pricing";
export {
  createProposal,
  reviseProposal,
  approveProposal,
  sendProposal,
  markProposalAccepted,
  markProposalDeclined,
  diffProposalVersions,
  expireProposals,
  type CreateProposalInput,
  type ProposalResult,
} from "./proposals/proposals";

// Deals + handoff
export {
  markWon,
  markLost,
  assignHandoff,
  acknowledgeHandoff,
  exportHandoff,
  releaseDueReengagements,
  type MarkWonInput,
  type MarkLostInput,
} from "./deals/deals";

// Revenue data (Phase 17)
export {
  getRevenueSummary,
  getLossReasons,
  getMeetingStats,
  getStageConversion,
  type AnalyticsFilters,
  type RevenueSummary,
} from "./revenue";

// Manifest registration inputs (Phase 19 imports the leaf files directly)
export { pipelineJobs } from "./jobs";
export { pipelineSchedules } from "./schedules";
export { pipelineSettings, PIPELINE_SETTING_KEYS } from "./settings";
export { pipelineNotificationTypes, PIPELINE_NOTIFICATION_TYPES } from "./notifications";
export { pipelineTasks, registerPipelineTasks } from "./tasks";
