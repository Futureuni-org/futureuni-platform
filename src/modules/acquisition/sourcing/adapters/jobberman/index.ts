import "server-only";

/**
 * Jobberman adapter (Phase 8) — DISABLED, and intentionally without a live implementation.
 * Jobberman has no public API; its terms (clause 22) ban robots and scraping without written
 * approval, and robots.txt disallows `/job/` and query pages. So there is no compliant way to fetch
 * its listings (INV-14). It stays registered as DISABLED so the search panel can explain why, and
 * `jobs-serpapi` with Nigerian locations covers much of the same inventory. Re-verified 2026-10-01.
 */

import { z } from "zod";

import { defineAdapter, type InternalSourceAdapter } from "../types";
import { emptyResults } from "../_shared/empty";

const ParamsSchema = z.object({});
type Params = z.infer<typeof ParamsSchema>;

// No compliant data source: the adapter never fetches. It can only run DISABLED, so this yields
// nothing (see the file header — no robots/terms-compliant access).
const search = (): ReturnType<typeof emptyResults> => emptyResults();

export const adapter: InternalSourceAdapter<Params> = {
  id: "jobberman",
  label: "Jobberman",
  description: "Nigerian job board — disabled: no API, and its terms and robots.txt forbid scraping.",
  markets: ["NIGERIA"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: () => 0,
  rateLimit: { perSecond: 1, perDay: null },
  costPerCallMicros: 0,
  termsNotes:
    "No API. Terms clause 22 bans robots/scraping without written approval; robots.txt disallows /job/ and query pages. No compliant access exists.",
  docsUrl: "https://www.jobberman.com/terms",
  termsUrl: "https://www.jobberman.com/terms",
  requiresCredential: null,
  status: "DISABLED",
  disabledReason:
    "Jobberman has no API; its terms (clause 22) ban robots/scraping without written approval and robots.txt disallows /job/. Enable only with a written data partnership (docs/integrations.md).",
};

export default defineAdapter(adapter);
