/**
 * Platform-home widgets for the acquisition module (Phase 19), fed by real services and registered
 * through the module manifest. The shell's widget registry imports the components from here; the
 * manifest's `acquisition.review-count` badge resolver uses `getReviewCountForUser`.
 */

export { AcquisitionReviewQueueWidget } from "./review-queue";
export { AcquisitionInboxWidget } from "./inbox";
export { AcquisitionPipelineValueWidget } from "./pipeline-value";
export { getReviewCountForUser } from "./review-count";
