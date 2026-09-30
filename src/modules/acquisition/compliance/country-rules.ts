/**
 * Country rules table (Phase 9, ADR-034).
 *
 * **REQUIRES LEGAL REVIEW. NOT LEGAL ADVICE.** These are defaults chosen to be conservative;
 * every row cites a public source. Countries not listed default to `REVIEW` — nothing here maps
 * an unknown country to `ALLOWED`.
 *
 * The `NG` row uses the `acquisition.compliance.ngDirectMarketingBasis` setting: while it is
 * `PENDING_LEGAL_REVIEW` (the launch default) every Nigerian lead is `REVIEW`. The setting can
 * later be moved to `LEGITIMATE_INTEREST_CONFIRMED` (incorporated bodies → `ALLOWED`) or
 * `CONSENT_ONLY` (every form → `CONSENT_REQUIRED`) once counsel signs it off.
 */

import type { CountryRule } from "@/contracts/enrichment";

type Bucket = CountryRule["coldEmail"];

const CONSENT_EVERYWHERE: Bucket = {
  incorporated: "CONSENT_REQUIRED",
  soleTrader: "CONSENT_REQUIRED",
  partnership: "CONSENT_REQUIRED",
  unknownForm: "CONSENT_REQUIRED",
};

const ALLOWED_INC_REVIEW_REST: Bucket = {
  incorporated: "ALLOWED",
  soleTrader: "REVIEW",
  partnership: "REVIEW",
  unknownForm: "REVIEW",
};

const REVIEW_EVERYWHERE: Bucket = {
  incorporated: "REVIEW",
  soleTrader: "REVIEW",
  partnership: "REVIEW",
  unknownForm: "REVIEW",
};

/** The GB PECR bucket. Incorporated bodies are allowed; sole traders and partnerships need consent. */
const UK_PECR: Bucket = {
  incorporated: "ALLOWED",
  soleTrader: "CONSENT_REQUIRED",
  partnership: "CONSENT_REQUIRED",
  unknownForm: "REVIEW",
};

export const COUNTRY_RULES: Readonly<Record<string, CountryRule>> = {
  NG: {
    country: "NG",
    coldEmail: REVIEW_EVERYWHERE, // Overridden at runtime by the ngDirectMarketingBasis setting.
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "NDPA 2023 + NDPC GAID 2025",
    notes:
      "REVIEW while acquisition.compliance.ngDirectMarketingBasis is PENDING_LEGAL_REVIEW. GAID Art. 18(1)(a) requires consent for direct marketing; Art. 26 requires a documented LIA. Set the platform setting after counsel review.",
    sourceUrl: "https://ndpc.gov.ng/",
  },
  GB: {
    country: "GB",
    coldEmail: UK_PECR,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "UK GDPR + PECR",
    notes:
      "PECR (§22) permits direct-marketing email to corporate subscribers without prior consent; sole traders and partnerships are treated as individuals (INV-6).",
    sourceUrl: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/",
  },
  IE: {
    country: "IE",
    coldEmail: ALLOWED_INC_REVIEW_REST,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "ePrivacy IE + GDPR",
    notes: "Corporate bodies allowed with opt-out; sole traders/partnerships need consent.",
    sourceUrl: "https://www.dataprotection.ie/",
  },
  US: {
    country: "US",
    coldEmail: ALLOWED_INC_REVIEW_REST,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "CAN-SPAM",
    notes: "Cold B2B email is permitted with a clear unsubscribe and the sender's postal address.",
    sourceUrl: "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business",
  },
  CA: {
    country: "CA",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "CASL",
    notes: "Consent required unless a listed exemption applies; unsubscribe within 10 business days.",
    sourceUrl: "https://crtc.gc.ca/eng/internet/anti.htm",
  },
  DE: {
    country: "DE",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "UWG + TDDDG",
    notes: "Strict consent regime for direct-marketing email; §7 UWG.",
    sourceUrl: "https://www.gesetze-im-internet.de/uwg_2004/",
  },
  FR: {
    country: "FR",
    coldEmail: ALLOWED_INC_REVIEW_REST,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "LCEN + GDPR",
    notes: "B2B soft-opt-in allowed; unclear cases need review.",
    sourceUrl: "https://www.cnil.fr/",
  },
  NL: {
    country: "NL",
    coldEmail: ALLOWED_INC_REVIEW_REST,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "Telecommunicatiewet",
    notes: "B2B cold email permitted; consumers require consent.",
    sourceUrl: "https://autoriteitpersoonsgegevens.nl/",
  },
  ES: {
    country: "ES",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "LSSI-CE + LOPDGDD",
    notes: "Consent required by default; limited soft-opt-in for existing customers.",
    sourceUrl: "https://www.aepd.es/",
  },
  IT: {
    country: "IT",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "GDPR + Codice Privacy",
    notes: "Consent required by default.",
    sourceUrl: "https://www.garanteprivacy.it/",
  },
  BE: {
    country: "BE",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "ePrivacy BE",
    notes: "Consent required for direct-marketing email; a narrow B2B exception exists.",
    sourceUrl: "https://www.gegevensbeschermingsautoriteit.be/",
  },
  AT: {
    country: "AT",
    coldEmail: CONSENT_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "TKG 2021",
    notes: "Consent required, including B2B.",
    sourceUrl: "https://www.rtr.at/",
  },
  ZA: {
    country: "ZA",
    coldEmail: REVIEW_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "POPIA",
    notes: "POPIA imposes opt-in for most direct marketing; treat as REVIEW until counsel review.",
    sourceUrl: "https://popia.co.za/",
  },
  GH: {
    country: "GH",
    coldEmail: REVIEW_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "Data Protection Act 2012",
    notes: "Treat as REVIEW until counsel review; opt-out required.",
    sourceUrl: "https://www.dataprotection.org.gh/",
  },
  KE: {
    country: "KE",
    coldEmail: REVIEW_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "Data Protection Act 2019",
    notes: "Treat as REVIEW until counsel review.",
    sourceUrl: "https://www.odpc.go.ke/",
  },
  AE: {
    country: "AE",
    coldEmail: REVIEW_EVERYWHERE,
    unsubscribeRequired: true,
    postalAddressRequired: true,
    regime: "PDPL",
    notes: "Treat as REVIEW until counsel review.",
    sourceUrl: "https://u.ae/en/about-the-uae/digital-uae/data/data-protection",
  },
};

/** REVIEW for every unknown country. */
export const UNKNOWN_COUNTRY_RULE: CountryRule = {
  country: "ZZ",
  coldEmail: REVIEW_EVERYWHERE,
  unsubscribeRequired: true,
  postalAddressRequired: true,
  regime: "Unknown jurisdiction",
  notes: "Unknown country: cold email held for review.",
  sourceUrl: "https://ec.europa.eu/info/law_en",
};

export function getCountryRule(country: string | null | undefined): CountryRule {
  if (country === null || country === undefined) return UNKNOWN_COUNTRY_RULE;
  const upper = country.toUpperCase();
  return COUNTRY_RULES[upper] ?? UNKNOWN_COUNTRY_RULE;
}
