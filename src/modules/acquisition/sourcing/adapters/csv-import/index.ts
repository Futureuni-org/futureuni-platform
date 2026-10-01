import "server-only";

/**
 * CSV import adapter metadata (Phase 8). The actual import runs through the `importCsv` service
 * (column mapping, row validation, the lawful-collection attestation, error report), not through a
 * provider `search`. This entry exists so the registry and the Search panel can list it.
 */

import { z } from "zod";

import { defineAdapter, type InternalSourceAdapter } from "../types";
import { emptyResults } from "../_shared/empty";

const ParamsSchema = z.object({});
type Params = z.infer<typeof ParamsSchema>;

// CSV rows arrive via the importCsv() service, not a provider search.
const search = (): ReturnType<typeof emptyResults> => emptyResults();

export const adapter: InternalSourceAdapter<Params> = {
  id: "csv-import",
  label: "CSV import",
  description: "Import a lawfully-collected list of businesses from a CSV file.",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: () => 0,
  rateLimit: { perSecond: 1000, perDay: null },
  costPerCallMicros: 0,
  termsNotes:
    "Uploaded data. Requires a lawful-collection attestation; purchased lists are banned (project-rules §Bans, INV-10).",
  docsUrl: "docs/specs/module-acquisition.md#35-sourcing-and-search",
  termsUrl: "docs/contracts/source-adapter.md",
  requiresCredential: null,
  status: "ENABLED",
};

export default defineAdapter(adapter);
