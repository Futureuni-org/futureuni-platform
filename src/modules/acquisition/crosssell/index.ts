/**
 * Cross-sell: one voice per company. One company qualifying across lines becomes one CrossSellGroup
 * with a single leading lead; the others are held so outreach never runs parallel threads (INV-9).
 * See `src/modules/acquisition/crosssell/README.md`.
 */

export {
  getCrossSellContext,
  setLeadingLead,
  splitGroup,
  listCrossSellOpportunities,
  type CrossSellOpportunity,
} from "./services";
export { detectCrossSell, chooseLeadingLead, CROSSSELL_DETECTED_NOTIFICATION, type DetectResult } from "./detect";
export type { QualifiedLead } from "./crosssell.repo";
