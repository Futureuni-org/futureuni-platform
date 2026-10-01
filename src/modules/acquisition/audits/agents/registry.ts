/** The audit agent registry, keyed by agent id and by service line. */

import "server-only";

import type { AuditAgent, AuditAgentId } from "@/contracts/audit-agent";
import type { ServiceLine } from "@/contracts/common";

import { graphicAuditAgent } from "./graphic";
import { uiuxAuditAgent } from "./uiux";
import { videoAuditAgent } from "./video";
import { webAuditAgent } from "./web";

export const AUDIT_AGENTS: Record<AuditAgentId, AuditAgent> = {
  "audit.web": webAuditAgent,
  "audit.uiux": uiuxAuditAgent,
  "audit.graphic": graphicAuditAgent,
  "audit.video": videoAuditAgent,
};

export function agentById(id: string): AuditAgent | null {
  return id in AUDIT_AGENTS ? AUDIT_AGENTS[id as AuditAgentId] : null;
}

export function agentForServiceLine(line: ServiceLine): AuditAgent | null {
  return Object.values(AUDIT_AGENTS).find((a) => a.serviceLine === line) ?? null;
}
