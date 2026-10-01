/** `audit.graphic` — the Graphic Design audit agent. */

import "server-only";

import type { AuditAgent } from "@/contracts/audit-agent";

import { GRAPHIC_CHECK_FNS } from "../checks/graphic";
import { COST_MICROS } from "../checks/cost";
import { makeSimpleAgent, type CheckDef } from "./factory";

const CHECKS: CheckDef[] = [
  { id: "graphic.brand_surfaces", label: "Brand surfaces", method: "OBSERVED", defaultRequired: true, estimatedCostMicros: COST_MICROS.capture, cacheScope: "company" },
  { id: "graphic.consistency", label: "Brand consistency", method: "AI_JUDGED", defaultRequired: true, aiTask: "acquisition.audit-graphic-consistency", estimatedCostMicros: COST_MICROS.aiVision, cacheScope: "company" },
  { id: "graphic.logo_quality", label: "Logo quality", method: "MEASURED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "company" },
  { id: "graphic.social_presence_fit", label: "Social presence fit", method: "OBSERVED", defaultRequired: false, estimatedCostMicros: 0, cacheScope: "company" },
];

export const graphicAuditAgent: AuditAgent = makeSimpleAgent("audit.graphic", "GRAPHIC_DESIGN", CHECKS, GRAPHIC_CHECK_FNS);
