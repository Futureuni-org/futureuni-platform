/** `audit.video` — the Video Editing audit agent. */

import "server-only";

import type { AuditAgent } from "@/contracts/audit-agent";

import { VIDEO_CHECK_FNS } from "../checks/video";
import { COST_MICROS } from "../checks/cost";
import { makeSimpleAgent, type CheckDef } from "./factory";

const CHECKS: CheckDef[] = [
  { id: "video.cadence", label: "Upload cadence", method: "MEASURED", defaultRequired: true, estimatedCostMicros: COST_MICROS.youtube, cacheScope: "company" },
  { id: "video.captions", label: "Captions", method: "MEASURED", defaultRequired: true, estimatedCostMicros: COST_MICROS.youtube, cacheScope: "company" },
  { id: "video.thumbnails", label: "Thumbnails", method: "AI_JUDGED", defaultRequired: true, aiTask: "acquisition.audit-video-thumbnails", estimatedCostMicros: COST_MICROS.aiVision, cacheScope: "company" },
  { id: "video.duration_profile", label: "Duration profile", method: "MEASURED", defaultRequired: false, estimatedCostMicros: COST_MICROS.youtube, cacheScope: "company" },
  { id: "video.engagement", label: "Engagement", method: "MEASURED", defaultRequired: false, estimatedCostMicros: COST_MICROS.youtube, cacheScope: "company" },
  { id: "video.titles_hooks", label: "Titles and hooks", method: "AI_JUDGED", defaultRequired: false, aiTask: "acquisition.audit-video-titles", estimatedCostMicros: COST_MICROS.aiText, cacheScope: "company" },
];

export const videoAuditAgent: AuditAgent = makeSimpleAgent("audit.video", "VIDEO_EDITING", CHECKS, VIDEO_CHECK_FNS);
