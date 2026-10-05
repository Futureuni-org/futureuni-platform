import "server-only";

import type { ReactNode } from "react";

import type { CurrentUser } from "@/platform/auth";

import {
  AcquisitionInboxWidget,
  AcquisitionPipelineValueWidget,
  AcquisitionReviewQueueWidget,
} from "@/modules/acquisition/ui/widgets";

export interface WidgetProps {
  user: CurrentUser;
  title: string;
  description?: string | undefined;
}

/**
 * Widget id → server renderer. The three acquisition widgets that `docs/specs/platform.md` §3.15
 * names ("My review queue", "My inbox", "Pipeline value") are owned by the acquisition module
 * (`src/modules/acquisition/ui/widgets/`) and fed by real services (Phase 19).
 */
export const WIDGET_REGISTRY: Record<string, (props: WidgetProps) => Promise<ReactNode>> = {
  "acquisition.my-review-queue": AcquisitionReviewQueueWidget,
  "acquisition.my-inbox": AcquisitionInboxWidget,
  "acquisition.pipeline-value": AcquisitionPipelineValueWidget,
};
