/**
 * `@/modules/acquisition/audits` — the free mini-audit (Phase 10, `docs/contracts/audit-agent.md`).
 *
 * Orchestration (`runAudits`) and the Phase 16 services (reads, rerun, dismiss) are the public
 * surface. `auditJobs`, `auditSettings` and `auditTasks` are wired onto the module manifest by
 * Phase 19 (see `phases/10/REQUESTS.md`). The browser capture runtime lives in `@/platform/browser`.
 */

import "server-only";

export { runAudits, type RunAuditsInput, type RunAuditsResult } from "./orchestration/run-audits";
export {
  getAuditsForLead,
  getFinding,
  rerunAudit,
  dismissFinding,
  type AuditView,
  type FindingView,
} from "./services";

// Manifest inputs for Wave-2 integration (Phase 19 wires them in).
export { auditJobs } from "./jobs";
export { auditSettings, AUDIT_SETTING_KEYS, AUDIT_SETTING_DEFAULTS } from "./settings";
export { auditTasks } from "./tasks";
