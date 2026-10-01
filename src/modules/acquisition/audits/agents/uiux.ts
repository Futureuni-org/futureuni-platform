/** `audit.uiux` — the UI/UX Design audit agent. */

import "server-only";

import type { AuditAgent } from "@/contracts/audit-agent";

import { UIUX_CHECK_FNS } from "../checks/uiux";
import { COST_MICROS } from "../checks/cost";
import { makeSimpleAgent, type CheckDef } from "./factory";

const CHECKS: CheckDef[] = [
  { id: "uiux.app_reviews", label: "App Store reviews", method: "AI_JUDGED", defaultRequired: true, aiTask: "acquisition.audit-uiux-review-analysis", estimatedCostMicros: COST_MICROS.aiText, cacheScope: "company" },
  { id: "uiux.onboarding_capture", label: "Onboarding capture", method: "OBSERVED", defaultRequired: true, estimatedCostMicros: COST_MICROS.capture * 2, cacheScope: "domain" },
  { id: "uiux.accessibility", label: "Accessibility (axe)", method: "MEASURED", defaultRequired: true, estimatedCostMicros: COST_MICROS.capture, cacheScope: "domain" },
  { id: "uiux.heuristics", label: "Usability heuristics", method: "AI_JUDGED", defaultRequired: false, aiTask: "acquisition.audit-uiux-heuristics", estimatedCostMicros: COST_MICROS.aiVision, cacheScope: "domain" },
  { id: "uiux.mobile_layout", label: "Mobile layout", method: "MEASURED", defaultRequired: false, estimatedCostMicros: COST_MICROS.capture, cacheScope: "domain" },
];

export const uiuxAuditAgent: AuditAgent = makeSimpleAgent("audit.uiux", "UI_UX_DESIGN", CHECKS, UIUX_CHECK_FNS);
