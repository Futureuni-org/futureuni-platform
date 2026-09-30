/**
 * Legal-form detection (Phase 9, `docs/contracts/enrichment.md` §3 rule 14).
 *
 * - **UK:** query Companies House by number (from a crawl hint) or by name; map `company_type`
 *   through `COMPANIES_HOUSE_TYPE_MAP`. Sole-trader wording gives `SOLE_TRADER`.
 * - **Nigeria:** `RC` hint → `NG_REGISTERED_COMPANY`; `BN` → `NG_BUSINESS_NAME`.
 * - Everything else falls to `UNKNOWN` unless a suffix hint gives it away.
 */

import "server-only";

import type { z } from "zod";

import { COMPANIES_HOUSE_TYPE_MAP, type LegalFormHintSchema, type LegalFormDetection } from "@/contracts/enrichment";
type LegalFormHint = z.infer<typeof LegalFormHintSchema>;
import type { LegalForm } from "@/contracts/common";
import { resolveProviderKey } from "@/platform/credentials";
import { safeFetch } from "@/platform/http";

const CH_BASE = "https://api.company-information.service.gov.uk";

type CompaniesHouseType = keyof typeof COMPANIES_HOUSE_TYPE_MAP;

/**
 * Try Companies House first by hinted number, then by name + city; failing both, use crawl
 * suffix hints; last resort `UNKNOWN`.
 */
export async function detectUkLegalForm(company: {
  name: string;
  city?: string | null;
  postcode?: string | null;
}, hints: readonly LegalFormHint[]): Promise<LegalFormDetection | null> {
  const numberHint = hints.find((h) => h.kind === "uk-company-number");
  if (numberHint !== undefined) {
    const detection = await lookupByNumber(numberHint.value);
    if (detection !== null) return detection;
  }
  const soleTraderHint = hints.find((h) => h.kind === "sole-trader-wording");
  if (soleTraderHint !== undefined) {
    return {
      legalForm: "SOLE_TRADER",
      source: "crawl-hint",
      confidence: 0.6,
      evidence: soleTraderHint.value,
    };
  }
  const nameDetection = await lookupByName(company.name, company.city ?? company.postcode ?? null);
  if (nameDetection !== null) return nameDetection;

  const suffixHint = hints.find((h) => h.kind === "suffix");
  if (suffixHint !== undefined) {
    return {
      legalForm: mapSuffix(suffixHint.value),
      source: "crawl-hint",
      confidence: 0.5,
      evidence: suffixHint.value,
    };
  }
  return null;
}

/** Nigerian hints — `RC` and `BN` give strong signals but we still return them with confidence. */
export function detectNgLegalForm(hints: readonly LegalFormHint[]): LegalFormDetection | null {
  const rc = hints.find((h) => h.kind === "ng-rc");
  if (rc !== undefined) {
    return { legalForm: "NG_REGISTERED_COMPANY", source: "cac-hint", confidence: 0.9, companyNumber: rc.value, evidence: rc.value };
  }
  const bn = hints.find((h) => h.kind === "ng-bn");
  if (bn !== undefined) {
    return { legalForm: "NG_BUSINESS_NAME", source: "cac-hint", confidence: 0.9, companyNumber: bn.value, evidence: bn.value };
  }
  return null;
}

async function lookupByNumber(number: string): Promise<LegalFormDetection | null> {
  const apiKey = await resolveProviderKey("companies-house");
  if (apiKey === null) return null;
  const url = `${CH_BASE}/company/${encodeURIComponent(number)}`;
  const res = await safeFetch(url, {
    respectRobots: false,
    timeoutMs: 15_000,
    headers: { authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
  });
  if (!res.ok || res.body === null) return null;
  const body = safeJson(res.body) as { company_type?: string; company_name?: string } | null;
  if (body === null) return null;
  return {
    legalForm: mapCompaniesHouseType(body.company_type),
    source: "companies-house",
    confidence: 0.95,
    companyNumber: number,
    ...(body.company_name === undefined ? {} : { matchedName: body.company_name }),
    evidence: `companies-house:${number}`,
  };
}

async function lookupByName(name: string, cityOrPostcode: string | null): Promise<LegalFormDetection | null> {
  const apiKey = await resolveProviderKey("companies-house");
  if (apiKey === null) return null;
  const query = cityOrPostcode !== null ? `${name} ${cityOrPostcode}` : name;
  const url = `${CH_BASE}/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`;
  const res = await safeFetch(url, {
    respectRobots: false,
    timeoutMs: 15_000,
    headers: { authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
  });
  if (!res.ok || res.body === null) return null;
  const body = safeJson(res.body) as { items?: { title?: string; company_number?: string; company_type?: string; company_status?: string }[] } | null;
  const items = body?.items ?? [];
  const target = normalise(name);
  const best = items
    .map((item) => ({ item, score: similarity(target, normalise(item.title ?? "")) }))
    .filter(({ item, score }) => score >= 0.6 && item.company_status !== "dissolved")
    .sort((a, b) => b.score - a.score)[0];
  if (best === undefined) return null;
  return {
    legalForm: mapCompaniesHouseType(best.item.company_type),
    source: "companies-house",
    confidence: Math.round(best.score * 100) / 100,
    ...(best.item.company_number === undefined ? {} : { companyNumber: best.item.company_number }),
    ...(best.item.title === undefined ? {} : { matchedName: best.item.title }),
    evidence: `companies-house:search:${best.item.company_number ?? "?"}`,
  };
}

function mapCompaniesHouseType(type: string | undefined): LegalForm {
  if (type === undefined) return "UNKNOWN";
  const mapped = (COMPANIES_HOUSE_TYPE_MAP as Record<string, LegalForm>)[type];
  return mapped ?? "OTHER";
}

function mapSuffix(suffix: string): LegalForm {
  const cleaned = suffix.replace(/\./g, "").trim().toUpperCase();
  if (cleaned === "LTD" || cleaned === "LIMITED") return "LIMITED";
  if (cleaned === "LLP") return "LLP";
  if (cleaned === "PLC") return "PLC";
  if (cleaned === "LLC") return "LLC";
  if (cleaned.startsWith("INC")) return "CORPORATION";
  return "OTHER";
}

function normalise(input: string): string {
  return input.toLowerCase().replace(/\b(limited|ltd|plc|llp|inc|llc|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Very simple token-set similarity. Zero-cost dependency; good enough for name matching. */
function similarity(a: string, b: string): number {
  if (a === "" || b === "") return 0;
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  const inter = [...at].filter((x) => bt.has(x)).length;
  const union = new Set([...at, ...bt]).size;
  return union === 0 ? 0 : inter / union;
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export type { CompaniesHouseType };
