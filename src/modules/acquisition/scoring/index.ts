/**
 * Scoring, qualification, briefs and capacity throttling. The engine is pure and deterministic; the
 * services wrap it with reads, transitions and the AI tasks. Provides SEAM-LEAD-BRIEF
 * (`getLeadBrief`) and SEAM-THROTTLE (`getOutreachThrottle`). See this folder's README.md.
 *
 * Registration bundles (jobs/settings/tasks/schedules/notifications/subscribers) are imported by the
 * acquisition manifest from their own files, not from this barrel, to avoid the manifest import cycle.
 */

// Engine (pure)
export {
  scoreLead,
  evalAtom,
  evalCondition,
  bandFor,
  type ScoreResult,
  type ScoreLeadInput,
  type ScoringConfig,
} from "./engine";
export { buildScoringFacts, hasAssistedChannel, type BuildScoringFactsInput } from "./facts";

// Qualification and manual lead actions
export { qualifyLead, disqualifyLead, assignLead, type QualifyResult } from "./qualify";
export { decideOutcome, type Outcome } from "./outcome";

// Briefs — SEAM-LEAD-BRIEF
export { getLeadBrief, generateBrief, validateBrief, type LeadBrief } from "./brief";

// Borderline review
export { runBorderlineReview, acceptReview, overrideReview, type BorderlineReviewResult } from "./review";

// Throttle — SEAM-THROTTLE
export {
  getOutreachThrottle,
  refreshLineCapacity,
  releaseCapacityHeld,
  refreshAllLines,
  computeThrottle,
  computeThrottleMode,
  effectiveDailyCap,
  loadPercent,
  lagosDayRange,
  ALL_SERVICE_LINES,
  type OutreachThrottle,
  type ThrottleDetail,
} from "./throttle";

// UI services
export {
  getLeadScore,
  rescoreLead,
  getThrottleStatus,
  type LeadScoreView,
  type ThrottleStatus,
} from "./services";

// Calibration
export { getScoreCalibrationData, type ScoreCalibration, type CalibrationBucket } from "./calibration";

// AI tasks (also exported from ./tasks for the manifest)
export { borderlineReviewTask, leadBriefTask, scoringTasks } from "./tasks";
