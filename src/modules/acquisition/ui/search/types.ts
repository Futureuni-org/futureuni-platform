import type { Market, ServiceLine } from "@/contracts/common";

/**
 * Client-side shapes for the Search panel. The panel builds a plain spec object from these and the
 * server action validates it with `SearchSpecSchema` before running or saving.
 */

export type MarketMode = "NIGERIA" | "INTERNATIONAL" | "BOTH";

/** A source adapter as the panel shows it (serialisable subset of the adapter registry). */
export interface SourceOption {
  id: string;
  label: string;
  description: string;
  markets: Market[];
  status: "ENABLED" | "DISABLED";
  disabledReason: string | null;
  costPerCallMicros: number;
}

/** The panel's editable state. */
export interface SearchDraft {
  market: MarketMode;
  ngLocation: string;
  intlLocation: string;
  keywords: string[];
  sources: string[];
  limit: number;
}

export const LIMIT_PRESETS = [25, 50, 100, 250] as const;

/** The exact wording the CSV import service requires (ban on purchased lists). Lives here (not in
 * the `"use server"` actions file, which may only export async functions) so both the client
 * wizard and the server action can import it. */
export const CSV_ATTESTATION_STATEMENT =
  "I confirm this data was not purchased and was collected lawfully.";

/**
 * Client-safe mirror of the sourcing module's `CSV_FIELDS` (that module is `server-only`, so a
 * client component can't import its runtime value). Kept in step with it by the CSV import tests.
 */
export const CSV_FIELD_LIST = [
  "companyName",
  "website",
  "phone",
  "email",
  "contactName",
  "contactRole",
  "city",
  "country",
  "notes",
] as const;

/** Markets selected by a market mode. */
export function marketsOf(mode: MarketMode): Market[] {
  if (mode === "BOTH") return ["NIGERIA", "INTERNATIONAL"];
  return [mode];
}

/** The market mode implied by a spec's `markets` array. */
export function marketModeOf(markets: readonly Market[]): MarketMode {
  const ng = markets.includes("NIGERIA");
  const intl = markets.includes("INTERNATIONAL");
  if (ng && intl) return "BOTH";
  return intl ? "INTERNATIONAL" : "NIGERIA";
}

/** Rebuild an editable draft from a stored spec (for the saved-search editor). */
export function specToDraft(spec: {
  markets: Market[];
  locations: { market: Market; text: string }[];
  keywords: string[];
  sources?: string[];
  limit: number;
}): SearchDraft {
  return {
    market: marketModeOf(spec.markets),
    ngLocation: spec.locations.find((l) => l.market === "NIGERIA")?.text ?? "",
    intlLocation: spec.locations.find((l) => l.market === "INTERNATIONAL")?.text ?? "",
    keywords: spec.keywords,
    sources: spec.sources ?? [],
    limit: spec.limit,
  };
}

/** Build the plain spec object the server validates with `SearchSpecSchema`. */
export function toSearchSpec(
  line: ServiceLine,
  draft: SearchDraft,
): Record<string, unknown> {
  const markets = marketsOf(draft.market);
  const locations: Record<string, unknown>[] = [];
  if (markets.includes("NIGERIA")) {
    locations.push({ market: "NIGERIA", text: draft.ngLocation.trim() });
  }
  if (markets.includes("INTERNATIONAL")) {
    locations.push({ market: "INTERNATIONAL", text: draft.intlLocation.trim() });
  }
  return {
    serviceLine: line,
    markets,
    locations,
    keywords: draft.keywords,
    sources: draft.sources,
    limit: draft.limit,
  };
}
