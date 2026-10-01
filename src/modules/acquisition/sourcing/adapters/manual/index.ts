import "server-only";

/**
 * Manual add adapter metadata (Phase 8). A single company/lead added by hand runs through the
 * `addManualLead` service (source recorded as `manual:<userId>`), not through a provider `search`.
 * This entry exists so the registry and the Search panel can list it.
 */

import { z } from "zod";

import { defineAdapter, type InternalSourceAdapter } from "../types";
import { emptyResults } from "../_shared/empty";

const ParamsSchema = z.object({});
type Params = z.infer<typeof ParamsSchema>;

// A manual entry arrives via the addManualLead() service, not a provider search.
const search = (): ReturnType<typeof emptyResults> => emptyResults();

export const adapter: InternalSourceAdapter<Params> = {
  id: "manual",
  label: "Manual add",
  description: "Add one business you found by hand; it follows the same pipeline.",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: () => 0,
  rateLimit: { perSecond: 1000, perDay: null },
  costPerCallMicros: 0,
  termsNotes: "Entered by a team member; source recorded as manual:<userId> (INV-10).",
  docsUrl: "docs/specs/module-acquisition.md#35-sourcing-and-search",
  termsUrl: "docs/contracts/source-adapter.md",
  requiresCredential: null,
  status: "ENABLED",
};

export default defineAdapter(adapter);
