/**
 * Compliance settings (Phase 9). Registered on the acquisition manifest by Phase 19 through
 * `phases/09/REQUESTS.md`. Read at runtime via `@/platform/settings`.
 */

import { z } from "zod";

import type { SettingDefinition } from "@/contracts/module-manifest";
import { defineSetting } from "@/platform/registry/define";

export const NgDirectMarketingBasisSchema = z.enum([
  "PENDING_LEGAL_REVIEW",
  "LEGITIMATE_INTEREST_CONFIRMED",
  "CONSENT_ONLY",
]);
export type NgDirectMarketingBasis = z.infer<typeof NgDirectMarketingBasisSchema>;

export const complianceSettings: SettingDefinition[] = [
  defineSetting<NgDirectMarketingBasis>({
    key: "acquisition.compliance.ngDirectMarketingBasis",
    scope: "MODULE",
    schema: NgDirectMarketingBasisSchema,
    default: "PENDING_LEGAL_REVIEW",
    label: "Nigerian direct-marketing basis",
    description:
      "Governs the NG contactability verdict: PENDING_LEGAL_REVIEW holds every NG lead in REVIEW; LEGITIMATE_INTEREST_CONFIRMED allows incorporated bodies under a documented LIA; CONSENT_ONLY forces consent for every form.",
    sensitive: false,
    requiredPermission: "acquisition.consent.manage",
    group: "compliance",
  }),
];
