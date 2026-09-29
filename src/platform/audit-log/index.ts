/**
 * @/platform/audit-log: the append-only audit log (INV-20).
 *
 * SEAM-AUDIT wires into `audit.record`.
 */

import "server-only";

export {
  audit,
  exportAuditCsv,
  getAuditForTarget,
  listAudit,
  withAudit,
  type AuditEntry,
  type AuditListItem,
  type AuditQuery,
} from "./service";
export { redact } from "./redact";
