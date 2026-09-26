import { describe, expect, it } from "vitest";

import { LegalForm } from "./common";
import { ContactabilitySchema, FieldSourcesSchema, LEGAL_FORM_BUCKET } from "./enrichment";
import { issuePaths } from "./test-helpers";

const valid = {
  email: {
    status: "CONSENT_REQUIRED",
    reason: "UK sole trader: cold email needs recorded consent (PECR).",
    ruleId: "GB.soleTrader",
  },
  whatsapp: { status: "ASSISTED_ALLOWED", reason: "Assisted only; a human sends it." },
  linkedin: { status: "ASSISTED_ALLOWED", reason: "Company page found; assisted only." },
  phone: { status: "CALL_TASK_ALLOWED", reason: "Business phone on the website." },
  lawfulBasis: "LEGITIMATE_INTEREST_B2B",
  evaluatedAt: "2026-10-03T09:02:11Z",
};

describe("enrichment contract", () => {
  it("parses the worked example (docs/contracts/enrichment.md §4)", () => {
    expect(ContactabilitySchema.parse(valid).email.status).toBe("CONSENT_REQUIRED");
  });

  it("rejects the invalid example (§5): WhatsApp is never automatic (INV-7)", () => {
    expect(
      issuePaths(
        ContactabilitySchema.safeParse({
          ...valid,
          whatsapp: { status: "AUTOMATIC", reason: "API" },
        }),
      ),
    ).toEqual(["whatsapp.status"]);
  });

  it("buckets every legal form", () => {
    for (const form of Object.values(LegalForm)) expect(LEGAL_FORM_BUCKET[form]).toBeDefined();
    expect(LEGAL_FORM_BUCKET.SOLE_TRADER).toBe("soleTrader");
  });

  it("records per-field provenance, unverified by default", () => {
    const sources = FieldSourcesSchema.parse({
      website: { source: "crawl", collectedAt: "2026-10-03T09:00:00Z" },
    });
    expect(sources.website?.verified).toBe(false);
  });
});
