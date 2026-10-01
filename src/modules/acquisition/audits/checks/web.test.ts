import { describe, expect, it } from "vitest";

import type { AuditCompanyInput, AuditContext, CaptureRequest, CaptureResult } from "@/contracts/audit-agent";
import type { SafeFetchResult } from "@/contracts/enrichment";
import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import { webBrokenLinks, webNoWebsite, webPagespeedMobile } from "./web";
import { uiuxOnboardingCapture } from "./uiux";

const NOW = new Date("2026-10-03T09:40:00Z");

function company(overrides: Partial<AuditCompanyInput> = {}): AuditCompanyInput {
  return {
    id: "cmp1",
    name: "Example Ltd",
    website: "https://example.example/",
    normalizedDomain: "example.example",
    websiteKind: "REAL",
    country: "NG",
    city: "Lagos",
    socials: {},
    techHints: null,
    externalRefs: [],
    ...overrides,
  };
}

interface FakeOpts {
  tryCharge?: boolean;
  safeFetch?: (url: string, init?: { method?: "GET" | "HEAD" }) => Promise<SafeFetchResult>;
  capture?: (req: CaptureRequest) => Promise<CaptureResult>;
}

function fakeCtx(opts: FakeOpts = {}): AuditContext {
  const store = new Map<string, unknown>();
  return {
    lead: { id: "lead1", serviceLine: "WEB_DEVELOPMENT", market: "NIGERIA", country: "NG" },
    profile: {} as ServiceLineProfile,
    requiredChecks: new Set(),
    safeFetch: (url: string, init?: { method?: "GET" | "HEAD" }) =>
      opts.safeFetch?.(url, init) ??
      Promise.resolve<SafeFetchResult>({
        ok: false, status: 0, finalUrl: url, headers: {}, contentType: null, body: null, bytes: 0,
        fetchedAt: NOW.toISOString(), blockedReason: "error",
      }),
    capture: (req: CaptureRequest) =>
      opts.capture?.(req) ??
      Promise.resolve<CaptureResult>({ ok: true, finalUrl: req.url, timings: { loadMs: 1 }, screenshotKey: "shot-1" }),
    runTask: () => Promise.reject(new Error("runTask not used")),
    storage: { putFile: () => Promise.resolve({ key: "k1" }) },
    costMeter: { tryCharge: () => opts.tryCharge ?? true, spentMicros: () => 0 },
    cache: {
      get: (k) => Promise.resolve(store.get(k) ?? null),
      set: (k, v) => {
        store.set(k, v);
        return Promise.resolve();
      },
    },
    clock: { now: () => NOW },
    signal: new AbortController().signal,
    force: false,
    log: { info: () => undefined, warn: () => undefined },
  };
}

describe("web.no_website", () => {
  it("fires HIGH with the social URL as the source when there is no website", async () => {
    const outcome = await webNoWebsite(
      company({ website: null, websiteKind: "NONE", socials: { instagram: "https://instagram.com/ex" } }),
      fakeCtx(),
    );
    expect(outcome.status).toBe("OK");
    expect(outcome.findings).toHaveLength(1);
    const f = outcome.findings[0];
    expect(f?.severity).toBe("HIGH");
    expect(f?.sourceUrl).toBe("https://instagram.com/ex");
    expect(f?.pitchable).toBe(true);
  });

  it("does nothing when the company has a real website", async () => {
    const outcome = await webNoWebsite(company(), fakeCtx());
    expect(outcome.status).toBe("OK");
    expect(outcome.findings).toHaveLength(0);
  });
});

describe("web.pagespeed_mobile", () => {
  it("produces a severe finding from a slow site, with a templated claim and thresholds", async () => {
    const outcome = await webPagespeedMobile(company({ website: "https://slow.example/", normalizedDomain: "slow.example" }), fakeCtx());
    expect(outcome.status).toBe("OK");
    const f = outcome.findings[0];
    expect(f).toBeDefined();
    expect(["HIGH", "MEDIUM"]).toContain(f?.severity);
    expect(f?.claim).toContain("show its main content on mobile");
    expect(f?.claim).toContain("3 Oct 2026");
    expect(f?.sourceUrl).toContain("pagespeed.web.dev");
    expect(f?.evidence.metrics?.lcpSeconds).toBeDefined();
    expect(f?.evidence.thresholds?.lcpSeconds).toBeDefined();
  }, 20_000);

  it("produces no finding for a fast site", async () => {
    const outcome = await webPagespeedMobile(company({ website: "https://fast.example/", normalizedDomain: "fast.example" }), fakeCtx());
    expect(outcome.findings).toHaveLength(0);
  }, 20_000);
});

describe("web.broken_links", () => {
  it("counts broken internal links via HEAD requests", async () => {
    const html = '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>';
    const safeFetch: FakeOpts["safeFetch"] = (url, init) => {
      if (init?.method === "HEAD") {
        const broken = url.endsWith("/b") || url.endsWith("/c");
        return Promise.resolve<SafeFetchResult>({
          ok: !broken, status: broken ? 404 : 200, finalUrl: url, headers: {}, contentType: null, body: null, bytes: 0, fetchedAt: NOW.toISOString(),
        });
      }
      return Promise.resolve<SafeFetchResult>({
        ok: true, status: 200, finalUrl: url, headers: {}, contentType: "text/html", body: html, bytes: html.length, fetchedAt: NOW.toISOString(),
      });
    };
    const outcome = await webBrokenLinks(company(), fakeCtx({ safeFetch }));
    expect(outcome.status).toBe("OK");
    const f = outcome.findings[0];
    expect(f?.evidence.counts?.brokenLinks).toBe(2);
    expect(f?.evidence.counts?.checked).toBe(3);
  });
});

describe("cost cap", () => {
  it("skips the onboarding capture when the per-lead cost cap is reached", async () => {
    const outcome = await uiuxOnboardingCapture(company(), fakeCtx({ tryCharge: false }));
    expect(outcome.status).toBe("SKIPPED_COST_CAP");
  });
});
