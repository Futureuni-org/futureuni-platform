/**
 * @/platform/http: the safe fetcher every crawl and API call goes through (Phase 9).
 *
 * Provides `SEAM-SAFE-FETCH` (Phases 8 and 10 wire their stand-ins to these functions at merge).
 */

import "server-only";

export { safeFetch, readCounters, resetCounters, type ExtendedSafeFetchOptions } from "./safe-fetch";
export { isAllowedByRobots, parse as parseRobots, isPathAllowed, _resetRobotsCache, setRobotsFetcher } from "./robots";
export { guardUrl, isPrivateAddress, configureSsrf } from "./ssrf";
export { configurePoliteness, _resetPoliteness, withPoliteness } from "./politeness";
