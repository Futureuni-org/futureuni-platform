/**
 * Integration test for `enrichLead` (Phase 9). Uses MSW to stand in for the target website and
 * the real database.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";

import { server } from "@/tests/setup/msw-server";
import { db } from "@/platform/db";
import { configureSsrf, _resetRobotsCache } from "@/platform/http";

import { enrichLead } from "./pipeline";

beforeAll(() => {
  configureSsrf({ trustHostnames: ["ada-labs.example"] });
});

afterAll(() => {
  configureSsrf();
});

afterEach(() => {
  _resetRobotsCache();
});

describe("enrichLead pipeline", () => {
  it("crawls a UK Ltd website, extracts contacts and moves the lead to ENRICHED", async () => {
    server.use(
      http.get("https://ada-labs.example/robots.txt", () => HttpResponse.text("User-agent: *\nAllow: /\n")),
      http.get("https://ada-labs.example/", () =>
        HttpResponse.html(
          `<html><body>
            <a href="/about">About</a>
            <a href="mailto:ada@ada-labs.example">Ada</a>
            <a href="/contact">Contact</a>
          </body></html>`,
        ),
      ),
      http.get("https://ada-labs.example/about", () =>
        HttpResponse.html(
          `<html><body>
            <p>Ada Adeleke, our founder, is a former print designer.</p>
            <footer>© 2024 Ada Labs Ltd</footer>
          </body></html>`,
        ),
      ),
      http.get("https://ada-labs.example/contact", () =>
        HttpResponse.html(`<html><body><p>Email us at hello@ada-labs.example.</p></body></html>`),
      ),
    );

    const company = await db.company.create({
      data: {
        name: "Ada Labs Ltd (pipeline)",
        normalizedName: "ada-labs-ltd-pipeline",
        website: "https://ada-labs.example/",
        normalizedDomain: `ada-labs-${String(Date.now())}.example`,
        country: "GB",
        legalForm: "LIMITED",
        market: "INTERNATIONAL",
        firstSource: "test",
      },
      select: { id: true },
    });
    const lead = await db.lead.create({
      data: {
        companyId: company.id,
        serviceLine: "WEB_DEVELOPMENT",
        market: "INTERNATIONAL",
        country: "GB",
        status: "NEW",
      },
      select: { id: true },
    });
    try {
      const result = await enrichLead({
        leadId: lead.id,
        actor: { type: "SYSTEM", job: "acquisition.enrichment.lead" },
      });
      expect(result.status).toBe("ENRICHED");
      expect(result.emailsFound).toBeGreaterThanOrEqual(1);
      expect(result.emailVerdict).toBe("ALLOWED");

      const events = await db.leadEvent.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } });
      const kinds = events.map((e) => e.toStatus);
      expect(kinds).toContain("ENRICHING");
      expect(kinds).toContain("ENRICHED");
    } finally {
      await db.contact.deleteMany({ where: { companyId: company.id } });
      await db.leadEvent.deleteMany({ where: { leadId: lead.id } });
      await db.lead.delete({ where: { id: lead.id } });
      await db.company.delete({ where: { id: company.id } });
    }
  });

  it("returns NO_WEBSITE gracefully when the company has no website", async () => {
    const company = await db.company.create({
      data: {
        name: "No Site Ltd",
        normalizedName: "no-site-ltd",
        market: "NIGERIA",
        country: "NG",
        legalForm: "NG_REGISTERED_COMPANY",
        firstSource: "test",
      },
      select: { id: true },
    });
    const lead = await db.lead.create({
      data: { companyId: company.id, serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", country: "NG", status: "NEW" },
      select: { id: true },
    });
    try {
      const result = await enrichLead({
        leadId: lead.id,
        actor: { type: "SYSTEM", job: "acquisition.enrichment.lead" },
      });
      // NG default: pending_legal_review → REVIEW. Not blocked, so ENRICHED with a REVIEW verdict.
      expect(result.status).toBe("ENRICHED");
      expect(result.emailVerdict).toBe("REVIEW");
      expect(result.pagesFetched).toBe(0);
    } finally {
      await db.leadEvent.deleteMany({ where: { leadId: lead.id } });
      await db.lead.delete({ where: { id: lead.id } });
      await db.company.delete({ where: { id: company.id } });
    }
  });
});
