/**
 * Builds the `AuditContext` for one agent run: the real `safeFetch`, `capture`, `runTask` and
 * `storage`, plus the per-lead cost meter, the domain cache, the clock, the abort signal and the
 * required-check set derived from the profile.
 */

import "server-only";

import type {
  AuditAgent,
  AuditCheckId,
  AuditContext,
} from "@/contracts/audit-agent";
import type { Clock } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";
import { capture } from "@/platform/browser";
import { safeFetch } from "@/platform/http";
import { runTask } from "@/platform/ai";
import { putFile } from "@/platform/storage";

import type { AuditCache } from "./cache";
import type { CostMeter } from "./cost-meter";

export interface AuditLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
}

export const defaultAuditLogger: AuditLogger = {
  info: () => undefined,
  warn: (msg, data) => {
    console.warn(`[audits] ${msg}`, data ?? {});
  },
};

/** The required check ids for an agent, from the profile's `audits[]` config. */
export function requiredChecksFor(profile: ServiceLineProfile, agent: AuditAgent): ReadonlySet<AuditCheckId> {
  const config = profile.audits.find((a) => a.agentId === agent.id);
  const required = (config?.checks ?? []).filter((c) => c.required).map((c) => c.checkId);
  return new Set(required);
}

export function buildAuditContext(params: {
  lead: { id: string; serviceLine: AuditContext["lead"]["serviceLine"]; market: AuditContext["lead"]["market"]; country: string | null };
  profile: ServiceLineProfile;
  requiredChecks: ReadonlySet<AuditCheckId>;
  costMeter: CostMeter;
  cache: AuditCache;
  clock: Clock;
  signal: AbortSignal;
  force: boolean;
  log: AuditLogger;
}): AuditContext {
  return {
    lead: params.lead,
    profile: params.profile,
    requiredChecks: params.requiredChecks,
    safeFetch,
    capture,
    runTask,
    storage: {
      async putFile(input): Promise<{ key: string }> {
        const stored = await putFile({
          key: input.key,
          body: input.body,
          contentType: input.contentType,
          access: "PRIVATE",
          purpose: "AUDIT_SCREENSHOT",
          module: "acquisition",
        });
        return { key: stored.key };
      },
    },
    costMeter: params.costMeter,
    cache: params.cache,
    clock: params.clock,
    signal: params.signal,
    force: params.force,
    log: params.log,
  };
}
