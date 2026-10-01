/**
 * @/modules/acquisition/sourcing — how the platform finds businesses that need FUTUREUNI
 * (Phase 8). The runner, source adapters, CSV import, manual add, saved searches, search history
 * and the AI helpers. The jobs, settings, schedules, AI tasks and notification types are exported
 * here and registered on the acquisition manifest at Wave 2 integration (phases/08/REQUESTS.md).
 */

export { runSearch, type RunSearchOptions } from "./runner";
export {
  estimateSearchCost,
  estimateSearchCostFor,
  type SearchCostEstimate,
  type AdapterCostEstimate,
} from "./cost";
export {
  importCsv,
  previewCsv,
  csvErrorReport,
  CSV_FIELDS,
  type CsvField,
  type ColumnMapping,
  type CsvPreview,
  type CsvRowError,
  type ImportCsvInput,
  type ImportCsvResult,
} from "./csv-import";
export { addManualLead, type ManualLeadInput, type ManualLeadResult } from "./manual";
export {
  createSavedSearch,
  updateSavedSearch,
  pauseSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  runSavedSearchNow,
  type CreateSavedSearchInput,
  type UpdateSavedSearchPatch,
} from "./saved-search";
export {
  listSearchRuns,
  getSearchRun,
  cancelSearchRun,
  getSourceStats,
  type SearchRunDetail,
} from "./history";
export { getSourcingDynamicSchedules, skipScheduledRunIfAtCapacity } from "./schedules";
export { listAdapters, getAdapter, ALL_ADAPTER_IDS } from "./adapters/registry";

// Manifest registrations (wired by Phase 19).
export { sourcingJobs } from "./jobs";
export { sourcingSettings, SOURCING_SETTING_KEYS } from "./settings";
export { sourcingTasks, registerSourcingTasks } from "./tasks";
export { sourcingNotificationTypes, SOURCING_RUN_COMPLETED } from "./notifications";
