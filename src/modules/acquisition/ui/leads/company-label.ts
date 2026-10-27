/**
 * Readable labels for leads whose company name is the Google Places placeholder.
 *
 * Google Maps Platform terms forbid storing a listing's real name, so a Places-only company is
 * saved as "Place <last 6 of place_id>" (see `src/platform/directory/upsert.ts`). This module turns
 * that placeholder into something a human can scan in the leads list and CSV export — composed from
 * the facts we DO own (our own industry label + the search city). The lead detail page fetches the
 * live Google name on open for the exact business; this is the list/export fallback.
 *
 * Pure (no server-only / DB imports) so it is cheap to unit-test and safe to reuse anywhere.
 */

/** Matches the stored placeholder "Place <6 url-safe chars of place_id>". */
export const PLACES_PLACEHOLDER = /^Place [A-Za-z0-9_-]{6}$/;

/** True when `name` is the Google Places placeholder (i.e. the real name was never stored). */
export function isPlacesPlaceholder(name: string, firstSource: string): boolean {
  return firstSource === "google-places" && PLACES_PLACEHOLDER.test(name);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface CompanyLabelInput {
  name: string;
  firstSource: string;
  city: string | null;
  industry: string | null;
}

/**
 * The name to show in lists/exports: the real stored name, or — for a Google Places placeholder —
 * a composed label from our industry label and the search city.
 */
export function companyLabel(company: CompanyLabelInput): string {
  if (!isPlacesPlaceholder(company.name, company.firstSource)) return company.name;

  const industryRaw = company.industry;
  const industry =
    industryRaw === null || industryRaw.trim() === "" ? null : titleCase(industryRaw);
  const cityRaw = company.city;
  const city = cityRaw === null || cityRaw.trim() === "" ? null : cityRaw.trim();

  if (industry !== null && city !== null) return `${industry} · ${city}`;
  if (industry !== null) return industry;
  if (city !== null) return `Business in ${city}`;
  return "Unnamed business";
}
