/**
 * Reads the audit settings, falling back to the registered defaults when a key isn't registered on
 * the manifest yet (Phase 19 wires them in; see `phases/10/REQUESTS.md`). This keeps the module
 * working end to end in its own worktree and in integration before registration.
 */

import "server-only";

import { AUDIT_SETTING_DEFAULTS, AUDIT_SETTING_KEYS } from "./settings";

export interface AuditConfig {
  perLeadCostCapMicros: number;
  cacheTtlSeconds: number;
  maxRequiredFailures: number;
  batchSize: number;
  refreshOlderThanDays: number;
  pagespeedMinScore: number;
  pagespeedMaxLcpMs: number;
  videoGoneQuietDays: number;
}

async function num(key: string, fallback: number): Promise<number> {
  try {
    const { getSetting } = await import("@/platform/settings");
    const value = await getSetting<number>(key);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export async function getAuditConfig(): Promise<AuditConfig> {
  const d = AUDIT_SETTING_DEFAULTS;
  const [
    perLeadCostCapMicros,
    cacheTtlDays,
    maxRequiredFailures,
    batchSize,
    refreshOlderThanDays,
    pagespeedMinScore,
    pagespeedMaxLcpMs,
    videoGoneQuietDays,
  ] = await Promise.all([
    num(AUDIT_SETTING_KEYS.perLeadCostCapMicros, d.perLeadCostCapMicros),
    num(AUDIT_SETTING_KEYS.cacheTtlDays, d.cacheTtlDays),
    num(AUDIT_SETTING_KEYS.maxRequiredFailures, d.maxRequiredFailures),
    num(AUDIT_SETTING_KEYS.batchSize, d.batchSize),
    num(AUDIT_SETTING_KEYS.refreshOlderThanDays, d.refreshOlderThanDays),
    num(AUDIT_SETTING_KEYS.pagespeedMinScore, d.pagespeedMinScore),
    num(AUDIT_SETTING_KEYS.pagespeedMaxLcpMs, d.pagespeedMaxLcpMs),
    num(AUDIT_SETTING_KEYS.videoGoneQuietDays, d.videoGoneQuietDays),
  ]);
  return {
    perLeadCostCapMicros,
    cacheTtlSeconds: cacheTtlDays * 24 * 60 * 60,
    maxRequiredFailures,
    batchSize,
    refreshOlderThanDays,
    pagespeedMinScore,
    pagespeedMaxLcpMs,
    videoGoneQuietDays,
  };
}
