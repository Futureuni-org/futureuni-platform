/**
 * Shared pieces of the seed world: row typing, ids for seeded users, companies and leads, and
 * each lead's derived facts (market, contact, when each status in its trail happened).
 */

import type { LeadStatus, Market, ServiceLine } from "@/contracts/common";

import { SEED_COMPANIES, seedCompany, type SeedCompany } from "../data/companies";
import { LEAD_SPECS, leadStatus, type LeadSpec } from "../data/leads";
import { SEED_USERS, type UserKey } from "../data/users";
import { seedId } from "../lib/ids";
import { ago } from "../lib/time";

/** A row to upsert: the model's unchecked create input with its deterministic id. */
export type Row<T> = T & { id: string };

/** Who approves a lead's messages: its owner when they may approve, else the line's service lead. */
export function approverId(lead: { spec: { line: ServiceLine; owner: UserKey } }): string {
  const owner = SEED_USERS.find((user) => user.key === lead.spec.owner);
  if (owner?.canApprove === true) return userId(owner.key);
  return userId(LINE_LEAD[lead.spec.line]);
}

export const LINE_LEAD = {
  WEB_DEVELOPMENT: "webLead",
  UI_UX_DESIGN: "uiuxLead",
  GRAPHIC_DESIGN: "graphicLead",
  VIDEO_EDITING: "videoLead",
} as const satisfies Record<ServiceLine, UserKey>;

export function userId(key: UserKey): string {
  const user = SEED_USERS.find((candidate) => candidate.key === key);
  if (user === undefined) throw new Error(`Unknown seed user "${key}".`);
  return seedId("user", user.n);
}

export const companyId = (n: number): string => seedId("comp", n);
export const leadId = (n: number): string => seedId("lead", n);

export function marketOf(company: SeedCompany): Market {
  return company.country === "NG" ? "NIGERIA" : "INTERNATIONAL";
}

export const CLOSED_STATUSES: readonly LeadStatus[] = ["WON", "LOST", "DISQUALIFIED", "SUPPRESSED"];

/** Each company's contacts get consecutive ids, in company order. */
export function contactIdsByCompany(): ReadonlyMap<number, readonly string[]> {
  const ids = new Map<number, string[]>();
  let next = 1;
  for (const company of SEED_COMPANIES) {
    ids.set(
      company.n,
      company.contacts.map(() => seedId("cont", next++)),
    );
  }
  return ids;
}

export interface LeadInfo {
  spec: LeadSpec;
  n: number;
  id: string;
  status: LeadStatus;
  company: SeedCompany;
  companyId: string;
  market: Market;
  country: string;
  ownerId: string;
  createdAt: Date;
  /** When each trail step happened (aligned with spec.trail). */
  times: readonly Date[];
  /** The primary contact: the first contact with an email or a phone. */
  contactId: string | null;
  contactIndex: number | null;
}

export function buildLeadInfos(now: Date): readonly LeadInfo[] {
  const contacts = contactIdsByCompany();
  return LEAD_SPECS.map((spec) => {
    const company = seedCompany(spec.company);
    const createdAt = ago(now, { days: spec.age });
    const final = ago(now, { days: spec.last ?? spec.age * 0.15 });
    const steps = spec.trail.length - 1;
    const times = spec.trail.map((_, index) =>
      steps === 0
        ? createdAt
        : new Date(createdAt.getTime() + ((final.getTime() - createdAt.getTime()) * index) / steps),
    );
    const contactIndex =
      spec.contact ??
      company.contacts.findIndex(
        (contact) =>
          contact.anonymized !== true &&
          (contact.email !== undefined || contact.phone !== undefined),
      );
    return {
      spec,
      n: spec.n,
      id: leadId(spec.n),
      status: leadStatus(spec),
      company,
      companyId: companyId(company.n),
      market: marketOf(company),
      country: company.country,
      ownerId: userId(spec.owner),
      createdAt,
      times,
      contactId: contactIndex === -1 ? null : (contacts.get(company.n)?.[contactIndex] ?? null),
      contactIndex: contactIndex === -1 ? null : contactIndex,
    };
  });
}

/** When the lead (first or last) entered `status`; null if its trail never passed through it. */
export function timeOf(
  lead: LeadInfo,
  status: LeadStatus,
  which: "first" | "last" = "first",
): Date | null {
  const index =
    which === "first" ? lead.spec.trail.indexOf(status) : lead.spec.trail.lastIndexOf(status);
  return index === -1 ? null : (lead.times[index] ?? null);
}

export function timeOfOrThrow(
  lead: LeadInfo,
  status: LeadStatus,
  which: "first" | "last" = "first",
): Date {
  const time = timeOf(lead, status, which);
  if (time === null) throw new Error(`Seed lead ${String(lead.n)} never reached ${status}.`);
  return time;
}

export function passed(lead: LeadInfo, status: LeadStatus): boolean {
  return lead.spec.trail.includes(status);
}

export function lastTime(lead: LeadInfo): Date {
  const time = lead.times.at(-1);
  if (time === undefined) throw new Error(`Seed lead ${String(lead.n)} has no trail.`);
  return time;
}

export function byLead(leads: readonly LeadInfo[], n: number): LeadInfo {
  const lead = leads[n - 1];
  if (lead?.n !== n) throw new Error(`Seed lead ${String(n)} is missing.`);
  return lead;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Sep 2026" (UTC), the format findings use for their capture date. */
export function formatDay(date: Date): string {
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ""} ${String(date.getUTCFullYear())}`;
}

export function websiteUrl(company: SeedCompany): string | null {
  return company.domain === null ? null : `https://${company.domain}`;
}
