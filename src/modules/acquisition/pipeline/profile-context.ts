/**
 * Profile-derived context for the pipeline's AI tasks and proposals. Everything a proposal or brief
 * says about packages, prices and portfolio comes from the active service-line profile (INV-17,
 * INV-19): prices are the profile's integer-minor ranges, and portfolio items exclude placeholders.
 */

import "server-only";

import type { Currency, Market, ServiceLine } from "@/contracts/common";
import { getActiveProfile, getPricingForLine, resolvePortfolio } from "@/modules/acquisition/profiles";

export interface PackageRange {
  id: string;
  name: string;
  minMinor: number;
  typicalMinor: number;
  maxMinor: number;
  currency: Currency;
}

export interface PortfolioRef {
  title: string;
  outcomeMetric: string | null;
}

export interface ProfileContext {
  currency: Currency;
  packages: PackageRange[];
  priceRange: { minMinor: number; maxMinor: number; currency: Currency } | null;
  portfolio: PortfolioRef[];
  catalogue: { name: string; includes: string[] }[];
}

/** The currency a market's proposals use (ADR: NGN for Nigeria; GBP for GB, else USD, internationally). */
export function currencyForMarket(market: Market, country: string | null): Currency {
  if (market === "NIGERIA") return "NGN";
  if (country === "GB") return "GBP";
  return "USD";
}

export async function getProfileContext(
  serviceLine: ServiceLine,
  market: Market,
  country: string | null,
  tags: readonly string[] = [],
): Promise<ProfileContext> {
  const currency = currencyForMarket(market, country);
  const [profile, pricingPackages] = await Promise.all([
    getActiveProfile(serviceLine),
    getPricingForLine(serviceLine, market),
  ]);

  const packages: PackageRange[] = pricingPackages.flatMap((pkg) => {
    const price = pkg.prices.find((p) => p.market === market && p.currency === currency);
    return price === undefined
      ? []
      : [
          {
            id: pkg.id,
            name: pkg.name,
            minMinor: price.minMinor,
            typicalMinor: price.typicalMinor,
            maxMinor: price.maxMinor,
            currency,
          },
        ];
  });

  const priceRange =
    packages.length === 0
      ? null
      : {
          minMinor: Math.min(...packages.map((p) => p.minMinor)),
          maxMinor: Math.max(...packages.map((p) => p.maxMinor)),
          currency,
        };

  const portfolio: PortfolioRef[] = resolvePortfolio(profile, market, tags).map((item) => ({
    title: item.title,
    outcomeMetric: item.outcomeMetric ?? null,
  }));

  const catalogue = pricingPackages.map((pkg) => ({ name: pkg.name, includes: pkg.includes }));

  return { currency, packages, priceRange, portfolio, catalogue };
}

/** The typical-package midpoint used as a card's estimated value when there's no proposal yet. */
export function typicalMidpointMinor(packages: PackageRange[]): number | null {
  if (packages.length === 0) return null;
  const typicals = packages.map((p) => p.typicalMinor).sort((a, b) => a - b);
  const mid = Math.floor(typicals.length / 2);
  const value = typicals.length % 2 === 1 ? typicals[mid] : Math.round(((typicals[mid - 1] ?? 0) + (typicals[mid] ?? 0)) / 2);
  return value ?? null;
}
