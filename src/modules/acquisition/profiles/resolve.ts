import "server-only";

/**
 * Pure resolvers other phases call: pitch angle ranking, portfolio filtering (never
 * placeholders — INV-19), pricing per line/market lookup, and the acquisition-references
 * selector used by every acquisition AI task.
 */

import type { Market, ServiceLine } from "@/contracts/common";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import { getActiveProfile } from "./read.repo";

/** Structural aliases derived from `ServiceLineProfile` so consumers don't import the schema. */
export type PitchAngle = ServiceLineProfile["pitchAngles"][Market][number];
export type PortfolioItem = ServiceLineProfile["portfolio"][number];
export type PricingPackage = ServiceLineProfile["pricing"]["packages"][number];

/**
 * Ranks pitch angles for a market by how many of the lead's signals and finding-check ids
 * the angle names in `whenToUse`. Higher overlap = higher score. Ties broken by declaration
 * order (stable). Returns every angle, best first.
 */
export function resolvePitchAngle(
  profile: ServiceLineProfile,
  market: Market,
  ctx: { signals: readonly string[]; findings: readonly { checkId: string }[] },
): { angle: PitchAngle; score: number; reason: string }[] {
  const angles = profile.pitchAngles[market];
  const signalSet = new Set(ctx.signals);
  const findingSet = new Set(ctx.findings.map((f) => f.checkId));
  return angles
    .map((angle, index) => {
      const signalHits = angle.whenToUse.signals.filter((s) => signalSet.has(s));
      const findingHits = angle.whenToUse.findingChecks.filter((c) => findingSet.has(c));
      const score = signalHits.length * 2 + findingHits.length;
      const reason =
        signalHits.length === 0 && findingHits.length === 0
          ? "no overlap"
          : `matches signals [${signalHits.join(",")}] findings [${findingHits.join(",")}]`;
      return { angle, score, reason, index };
    })
    .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score))
    .map(({ angle, score, reason }) => ({ angle, score, reason }));
}

/**
 * Filters portfolio items matching `tags` for the given `market`, EXCLUDING placeholders
 * (INV-19). Returned in tag-match-count order, tie-broken by declaration order.
 */
export function resolvePortfolio(
  profile: ServiceLineProfile,
  market: Market,
  tags: readonly string[],
): PortfolioItem[] {
  const tagSet = new Set(tags);
  return profile.portfolio
    .filter((it) => !it.isPlaceholder && it.markets.includes(market))
    .map((it, index) => ({
      it,
      hits: it.tags.filter((t) => tagSet.has(t)).length,
      index,
    }))
    .filter((r) => (tags.length === 0 ? true : r.hits > 0))
    .sort((a, b) => (b.hits === a.hits ? a.index - b.index : b.hits - a.hits))
    .map((r) => r.it);
}

/**
 * Reads the active profile via SEAM-PROFILE and returns its pricing packages for one
 * market. Empty when the profile has no package that carries a price row for `market`
 * (should never happen — validateProfile requires at least one price row per package).
 */
export async function getPricingForLine(
  line: ServiceLine,
  market: Market,
): Promise<PricingPackage[]> {
  const profile = await getActiveProfile(line);
  return profile.pricing.packages.filter((pkg) => pkg.prices.some((pr) => pr.market === market));
}

/**
 * Reference selector used by every acquisition AI task. Returns paths under
 * `runtime-skills/` in the fixed order (M7-AC7):
 *   1. services-catalogue.md
 *   2. evidence-rules.md
 *   3. lines/<line>.md
 *   4. markets/<market>.md — nigeria + international when market === "both"
 */
const LINE_TO_FILE: Readonly<Record<ServiceLine, string>> = {
  WEB_DEVELOPMENT: "web-development",
  UI_UX_DESIGN: "ui-ux-design",
  GRAPHIC_DESIGN: "graphic-design",
  VIDEO_EDITING: "video-editing",
};

export type ReferenceMarket = Market | "both";

export function selectAcquisitionReferences(args: {
  serviceLine: ServiceLine;
  market: ReferenceMarket;
}): { path: string; optional?: boolean }[] {
  const paths: { path: string; optional?: boolean }[] = [
    { path: "acquisition/_references/services-catalogue.md" },
    { path: "acquisition/_references/evidence-rules.md" },
    { path: `acquisition/_references/lines/${LINE_TO_FILE[args.serviceLine]}.md` },
  ];
  if (args.market === "both") {
    paths.push({ path: "acquisition/_references/markets/nigeria.md" });
    paths.push({ path: "acquisition/_references/markets/international.md" });
  } else {
    const marketFile = args.market === "NIGERIA" ? "nigeria" : "international";
    paths.push({ path: `acquisition/_references/markets/${marketFile}.md` });
  }
  return paths;
}
