/**
 * Extract an address from schema.org PostalAddress or an English/Nigerian footer format.
 * Very small; Phase 20 can add locale-aware parsing.
 */

export interface ExtractedAddress {
  line?: string;
  city?: string;
  postcode?: string;
  country?: string;
}

const SCHEMA_ADDRESS_RE = /"address"\s*:\s*\{([^{}]*)\}/i;

export function extractAddress(html: string, defaultCountry?: string | null): ExtractedAddress | null {
  const schema = SCHEMA_ADDRESS_RE.exec(html);
  if (schema?.[1] !== undefined) {
    const inner = schema[1];
    const line = pick(inner, "streetAddress");
    const city = pick(inner, "addressLocality");
    const postcode = pick(inner, "postalCode");
    const country = pick(inner, "addressCountry") ?? defaultCountry ?? undefined;
    if (line !== undefined || city !== undefined || postcode !== undefined) {
      return {
        ...(line === undefined ? {} : { line }),
        ...(city === undefined ? {} : { city }),
        ...(postcode === undefined ? {} : { postcode }),
        ...(country === undefined ? {} : { country }),
      };
    }
  }

  // UK-style postcode fallback: pick the first line that ends with a UK postcode.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const ukPostcodeRe = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/;
  const pc = ukPostcodeRe.exec(text);
  if (pc?.[1] !== undefined) {
    return { postcode: pc[1].toUpperCase(), ...(defaultCountry === undefined || defaultCountry === null ? {} : { country: defaultCountry }) };
  }
  return null;
}

function pick(json: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`);
  const match = re.exec(json);
  return match?.[1] ?? undefined;
}
