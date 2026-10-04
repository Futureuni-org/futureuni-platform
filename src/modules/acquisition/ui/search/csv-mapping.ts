import type { CsvField } from "@/modules/acquisition/sourcing";

import { CSV_FIELD_LIST } from "./types";

/**
 * Pure column-mapping helpers for the CSV import wizard: human labels, header synonyms, and
 * auto-detection. Kept free of server imports so it can be unit-tested and bundled to the client.
 */

export const FIELD_LABELS: Record<CsvField, string> = {
  companyName: "Company name",
  website: "Website",
  phone: "Phone",
  email: "Email",
  contactName: "Contact name",
  contactRole: "Contact role",
  city: "City",
  country: "Country",
  notes: "Notes",
};

const SYNONYMS: Record<CsvField, string[]> = {
  companyName: ["company", "companyname", "business", "name", "organisation", "organization"],
  website: ["website", "url", "site", "web", "domain"],
  phone: ["phone", "tel", "telephone", "mobile", "whatsapp"],
  email: ["email", "e-mail", "mail"],
  contactName: ["contact", "contactname", "person", "fullname"],
  contactRole: ["role", "title", "position", "jobtitle"],
  city: ["city", "town"],
  country: ["country"],
  notes: ["notes", "note", "comment", "comments"],
};

function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function autoMap(header: string[]): Record<string, CsvField> {
  const mapping: Record<string, CsvField> = {};
  for (const column of header) {
    const key = normalise(column);
    for (const field of CSV_FIELD_LIST) {
      if (SYNONYMS[field].some((syn) => normalise(syn) === key)) {
        mapping[column] = field;
        break;
      }
    }
  }
  return mapping;
}
