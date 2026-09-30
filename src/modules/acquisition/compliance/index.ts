/**
 * @/modules/acquisition/compliance: country rules, legal-form detection, contactability,
 * suppression, consent, DSR and retention purge (Phase 9).
 */

import "server-only";

export { COUNTRY_RULES, UNKNOWN_COUNTRY_RULE, getCountryRule } from "./country-rules";
export { detectUkLegalForm, detectNgLegalForm } from "./legal-form";
export { getContactability, assertEmailAllowed } from "./contactability";
export { addSuppression, removeSuppression, listSuppressions, importSuppressions, type AddSuppressionInput, type SuppressionCascade } from "./suppression";
export { recordConsent, revokeConsent } from "./consent";
export { createDataSubjectRequest, fulfilExport, fulfilDelete } from "./dsr";
export { runAcquisitionRetentionPurge, type RetentionPurgeResult } from "./retention";
export { reevaluateOpenLeads } from "./reevaluate";
export { complianceJobs, retentionPurgeJob, reevaluateJob } from "./jobs";
export { complianceSettings, NgDirectMarketingBasisSchema, type NgDirectMarketingBasis } from "./settings";
export { complianceSubscribers, settingsChangedSubscriber } from "./subscribers";
