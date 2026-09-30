/**
 * Pure extractors. Every function is deterministic and free of I/O so the crawler can pass in the
 * HTML it fetched via `safeFetch` (Phase 9).
 */

export { extractEmails, decodeEntities, classifyLocalPart, isPlaceholder } from "./emails";
export { extractPhones } from "./phones";
export { extractSocials } from "./socials";
export { extractTechHints } from "./tech-hints";
export { extractLegalFormHints } from "./legal-form-hints";
export { extractAddress, type ExtractedAddress } from "./address";
