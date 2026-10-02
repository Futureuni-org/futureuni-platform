/**
 * Convenience type aliases and option lists for the profile editor. Pure data derived from the
 * contract (`@/contracts/service-line-profile`) — safe to import from client and server.
 */

import { SourceAdapterIdSchema } from "@/contracts/source-adapter";
import { AuditAgentIdSchema, AuditCheckIdSchema } from "@/contracts/audit-agent";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

export type Signal = ServiceLineProfile["signals"][number];
export type Source = ServiceLineProfile["sources"][number];
export type AuditConfig = ServiceLineProfile["audits"][number];
export type ScoringRule = ServiceLineProfile["scoring"]["rules"][number];
export type PitchAngle = ServiceLineProfile["pitchAngles"]["NIGERIA"][number];
export type PortfolioItem = ServiceLineProfile["portfolio"][number];
export type PricingPackage = ServiceLineProfile["pricing"]["packages"][number];
export type PriceRange = PricingPackage["prices"][number];
export type SequenceDef = ServiceLineProfile["sequences"]["NIGERIA"][number];
export type SequenceStep = SequenceDef["steps"][number];
export type Disqualifier = ServiceLineProfile["disqualifiers"][number];

export type Market = "NIGERIA" | "INTERNATIONAL";
export const MARKETS: { value: Market; label: string }[] = [
  { value: "NIGERIA", label: "Nigeria" },
  { value: "INTERNATIONAL", label: "International" },
];

export const CHANNELS = [
  { value: "EMAIL", label: "Email (auto-send)" },
  { value: "WHATSAPP_ASSISTED", label: "WhatsApp (assisted)" },
  { value: "LINKEDIN_ASSISTED", label: "LinkedIn (assisted)" },
  { value: "CALL_TASK", label: "Call task" },
] as const;

export const APPROVAL_MODES = [
  { value: "ALWAYS_REVIEW", label: "Always review" },
  { value: "AUTO_SEND_ABOVE_SCORE", label: "Auto-send above a score" },
] as const;

export const SEVERITIES = [
  { value: "INFO", label: "Info" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

export const STEP_PURPOSES = [
  { value: "INTRO_AUDIT_INSIGHT", label: "Intro / audit insight" },
  { value: "VALUE_ADD", label: "Value add" },
  { value: "PORTFOLIO_PROOF", label: "Portfolio proof" },
  { value: "SOFT_BREAKUP", label: "Soft break-up" },
  { value: "CALL", label: "Call" },
  { value: "FOLLOW_UP", label: "Follow-up" },
] as const;

export const STOP_CONDITIONS = [
  "ANY_REPLY",
  "BOUNCE",
  "UNSUBSCRIBE",
  "MEETING_BOOKED",
  "SUPPRESSED",
  "LEAD_INACTIVE",
] as const;

export const LOW_SCORE_ACTIONS = [
  { value: "DISQUALIFY", label: "Disqualify" },
  { value: "NURTURE", label: "Nurture" },
] as const;

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
export const MARKET_CURRENCIES: Record<Market, readonly string[]> = {
  NIGERIA: ["NGN"],
  INTERNATIONAL: ["USD", "GBP", "EUR"],
};

/** The 18 condition fields the rule/disqualifier builder can compare. */
export const CONDITION_FIELDS = [
  { value: "market", label: "Market" },
  { value: "country", label: "Country code" },
  { value: "company.legalForm", label: "Company: legal form" },
  { value: "company.sizeRange", label: "Company: size range" },
  { value: "company.websiteKind", label: "Company: website kind" },
  { value: "company.hasWebsite", label: "Company: has a website" },
  { value: "company.industry", label: "Company: industry" },
  { value: "company.isActiveClient", label: "Company: is an active client" },
  { value: "company.copyrightYear", label: "Company: copyright year" },
  { value: "contact.primary.exists", label: "Contact: a primary exists" },
  { value: "contact.primary.emailStatus", label: "Contact: email status" },
  { value: "contact.primary.emailType", label: "Contact: email type" },
  { value: "contact.primary.whatsappStatus", label: "Contact: WhatsApp status" },
  { value: "contact.primary.seniority", label: "Contact: seniority" },
  { value: "contactability.email", label: "Contactability: email verdict" },
  { value: "contactability.hasAssistedChannel", label: "Contactability: has an assisted channel" },
  { value: "signal.count", label: "Signal count" },
  { value: "finding.pitchableCount", label: "Pitchable finding count" },
] as const;

export const CONDITION_OPS = [
  { value: "eq", label: "is" },
  { value: "neq", label: "is not" },
  { value: "in", label: "is one of" },
  { value: "notIn", label: "is not one of" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
] as const;

// Keep the literal-union element types (not widened to string) so item IDs stay well-typed.
export const SOURCE_ADAPTER_IDS = SourceAdapterIdSchema.options;
export const AUDIT_CHECK_IDS = AuditCheckIdSchema.options;
export const AUDIT_AGENT_IDS = AuditAgentIdSchema.options;

/** Which channels can send automatically (INV-7: only EMAIL). */
export function isAutomaticChannel(channel: string): boolean {
  return channel === "EMAIL";
}
