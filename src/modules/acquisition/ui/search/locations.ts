/**
 * Location suggestions for the search combobox. Free text is always allowed; these are just
 * quick-pick options. Nigerian cities when the market is Nigeria; countries and major cities when
 * International. Kept small and editable — not an exhaustive gazetteer.
 */

export const NIGERIA_LOCATIONS: readonly string[] = [
  "Lagos",
  "Abuja",
  "Port Harcourt",
  "Ibadan",
  "Kano",
  "Benin City",
  "Warri",
  "Enugu",
  "Kaduna",
  "Uyo",
  "Abeokuta",
  "Owerri",
];

export const INTERNATIONAL_LOCATIONS: readonly string[] = [
  "United Kingdom",
  "London, UK",
  "Manchester, UK",
  "Birmingham, UK",
  "United States",
  "New York, US",
  "Austin, US",
  "Ireland",
  "Dublin, Ireland",
  "Canada",
  "Toronto, Canada",
];
