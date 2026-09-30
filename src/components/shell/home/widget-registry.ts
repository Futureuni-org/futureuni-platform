import "server-only";

import type { ReactNode } from "react";

import type { CurrentUser } from "@/platform/auth";

import { AcquisitionInboxWidget } from "./widgets/acquisition-inbox";
import { AcquisitionPipelineValueWidget } from "./widgets/acquisition-pipeline-value";
import { AcquisitionReviewQueueWidget } from "./widgets/acquisition-review-queue";

export interface WidgetProps {
  user: CurrentUser;
  title: string;
  description?: string | undefined;
}

/**
 * Widget id → server renderer. Phase 4 ships placeholders for the three acquisition widgets that
 * `docs/specs/platform.md` §3.15 names ("My review queue", "My inbox", "Pipeline value"). Phase 7
 * re-registers them at merge with real acquisition service reads.
 */
export const WIDGET_REGISTRY: Record<string, (props: WidgetProps) => Promise<ReactNode>> = {
  "acquisition.my-review-queue": AcquisitionReviewQueueWidget,
  "acquisition.my-inbox": AcquisitionInboxWidget,
  "acquisition.pipeline-value": AcquisitionPipelineValueWidget,
};
