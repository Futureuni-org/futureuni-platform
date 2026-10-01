import { describe, expect, it } from "vitest";

import type { Contactability } from "@/contracts/enrichment";
import type { AuditFinding, Company, Signal } from "@/platform/db";

import { buildScoringFacts, hasAssistedChannel } from "./facts";

function contactability(over: Partial<Contactability> = {}): Contactability {
  return {
    email: { status: "ALLOWED", reason: "ok" },
    whatsapp: { status: "BLOCKED", reason: "none" },
    linkedin: { status: "BLOCKED", reason: "none" },
    phone: { status: "BLOCKED", reason: "none" },
    lawfulBasis: "LEGITIMATE_INTEREST_B2B",
    evaluatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

const company = {
  legalForm: "LIMITED",
  sizeRange: "SIZE_2_10",
  websiteKind: "OWN_SITE",
  website: "https://acme.test",
  industry: "retail",
  isActiveClient: false,
  copyrightYear: 2020,
} satisfies Pick<Company, "legalForm" | "sizeRange" | "websiteKind" | "website" | "industry" | "isActiveClient" | "copyrightYear">;

describe("hasAssistedChannel", () => {
  it("is true when any of WhatsApp / LinkedIn / phone is not BLOCKED", () => {
    expect(hasAssistedChannel(contactability())).toBe(false);
    expect(hasAssistedChannel(contactability({ whatsapp: { status: "ASSISTED_ALLOWED", reason: "" } }))).toBe(true);
    expect(hasAssistedChannel(contactability({ phone: { status: "CALL_TASK_ALLOWED", reason: "" } }))).toBe(true);
  });
});

describe("buildScoringFacts", () => {
  it("maps rows to facts, derives hasWebsite and drops dismissed findings", () => {
    const facts = buildScoringFacts({
      lead: { market: "NIGERIA", country: "NG" },
      company,
      primaryContact: {
        emailStatus: "VALID",
        emailType: "PERSONAL",
        whatsappStatus: "CONFIRMED",
        seniority: "OWNER",
      },
      signals: [{ id: "s1", signalType: "no_website" }] as Pick<Signal, "id" | "signalType">[],
      findings: [
        { id: "f1", checkId: "web.ssl", severity: "HIGH", pitchable: true, dismissedAt: null },
        { id: "f2", checkId: "web.seo_basics", severity: "LOW", pitchable: false, dismissedAt: new Date() },
      ] as Pick<AuditFinding, "id" | "checkId" | "severity" | "pitchable" | "dismissedAt">[],
      contactability: contactability({ whatsapp: { status: "ASSISTED_ALLOWED", reason: "" } }),
    });

    expect(facts.market).toBe("NIGERIA");
    expect(facts.company.hasWebsite).toBe(true);
    expect(facts.contact.primary.exists).toBe(true);
    expect(facts.contactability).toEqual({ email: "ALLOWED", hasAssistedChannel: true });
    expect(facts.findings).toHaveLength(1); // the dismissed one is dropped
    expect(facts.findings[0]).toMatchObject({ id: "f1", dismissed: false });
    expect(facts.signals).toEqual([{ id: "s1", signalType: "no_website" }]);
  });

  it("handles a missing primary contact and a social-only company (no website)", () => {
    const facts = buildScoringFacts({
      lead: { market: "INTERNATIONAL", country: "GB" },
      company: { ...company, websiteKind: "SOCIAL_ONLY", website: null },
      primaryContact: null,
      signals: [],
      findings: [],
      contactability: contactability(),
    });
    expect(facts.company.hasWebsite).toBe(false);
    expect(facts.contact.primary).toEqual({
      exists: false,
      emailStatus: null,
      emailType: null,
      whatsappStatus: null,
      seniority: null,
    });
  });
});
