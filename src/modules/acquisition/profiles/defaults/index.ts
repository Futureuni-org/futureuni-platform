import "server-only";

/**
 * The four default `ServiceLineProfile` values, keyed by ServiceLine. These are the seed
 * defaults (module spec §3.3): version 1 lands from here only when a line has no version.
 * Every price is a placeholder pending Prince's confirmation (`needsReview: true`); every
 * portfolio item is a placeholder (`isPlaceholder: true`, INV-19).
 */

import type { ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import { graphicDesignDefaultProfile } from "./graphic-design";
import { uiUxDesignDefaultProfile } from "./ui-ux-design";
import { videoEditingDefaultProfile } from "./video-editing";
import { webDevelopmentDefaultProfile } from "./web-development";

export const DEFAULT_PROFILES: Readonly<Record<ServiceLine, ServiceLineProfile>> = {
  WEB_DEVELOPMENT: webDevelopmentDefaultProfile,
  UI_UX_DESIGN: uiUxDesignDefaultProfile,
  GRAPHIC_DESIGN: graphicDesignDefaultProfile,
  VIDEO_EDITING: videoEditingDefaultProfile,
};

export {
  graphicDesignDefaultProfile,
  uiUxDesignDefaultProfile,
  videoEditingDefaultProfile,
  webDevelopmentDefaultProfile,
};
