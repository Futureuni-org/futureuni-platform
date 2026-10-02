/**
 * `@/components/admin` — shared admin and settings building blocks (Phase 18).
 *
 * These are admin-specific composites, allowed by the Wave 4 UI bar (B3.1) in Phase 18's own
 * folder. Any that prove generally useful are listed in `phases/18/REQUESTS.md` as candidates to
 * promote into `@/components/ui` or `@/components/patterns`.
 */

export { SettingsSection } from "./settings-section";
export { DangerZone, DangerRow } from "./danger-zone";
export { SecretField, type SecretStatus } from "./secret-field";
export { AuditTrailPanel, type AuditTrailEntry } from "./audit-trail-panel";
export { SettingField, type SettingFieldDescriptor } from "./setting-field";
export { Field } from "./field";
export { PasswordField } from "./password-field";
export { Select, type SelectOption } from "./select";
export { ConfirmDialog } from "./confirm-dialog";
export { AdminTable, type AdminColumn } from "./admin-table";
export { FilterBar, UrlSearchInput, UrlSelect, UrlDateInput } from "./filters";
