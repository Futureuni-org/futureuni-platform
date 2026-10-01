/**
 * Web Development checks (`audit.web`). Deterministic checks phrase their claims from measured values
 * via `../claims/templates`; the optional first-impression check is AI-judged over screenshots.
 */

import "server-only";

import type { AuditCheckId, AuditCompanyInput, AuditContext, AuditFindingInput } from "@/contracts/audit-agent";

import { getAuditConfig } from "../config";
import { runAuditAiFindings, imagesFromArtifacts } from "../ai/run";
import { claim } from "../claims/templates";
import { companyScopeKey, getCapture, getHomepage } from "./capture-helpers";
import { COST_MICROS } from "./cost";
import {
  countH1,
  extractCopyrightYear,
  extractInternalLinks,
  extractMetaDescription,
  extractTitle,
  hasHttpForm,
  hasOpenGraph,
  hasViewportMeta,
  legacyTechHints,
} from "./html";
import { getCertInfo } from "./tls";
import {
  checkFailed,
  notApplicable,
  ok,
  okEmpty,
  skippedCostCap,
  type CheckFn,
  type CheckOutcome,
} from "./types";

const SOCIAL_OR_MARKETPLACE = new Set(["SOCIAL", "MARKETPLACE", "NONE", "DIRECTORY"]);

export function hasRealWebsite(company: AuditCompanyInput): boolean {
  if (company.website === null || company.website === "") return false;
  return !SOCIAL_OR_MARKETPLACE.has(company.websiteKind.toUpperCase());
}

function firstPresenceUrl(company: AuditCompanyInput): string | null {
  const social = Object.values(company.socials).find((v): v is string => typeof v === "string" && v.length > 0);
  if (social !== undefined) return social;
  const ref = company.externalRefs.find((r) => r.url !== undefined);
  return ref?.url ?? company.website ?? null;
}

export const webNoWebsite: CheckFn = (company, ctx) => {
  const checkId: AuditCheckId = "web.no_website";
  if (hasRealWebsite(company)) return Promise.resolve(okEmpty(checkId));
  const presenceUrl = firstPresenceUrl(company);
  if (presenceUrl === null) return Promise.resolve(okEmpty(checkId)); // nothing to cite (INV-18)
  const presence = company.website !== null && company.website !== "" ? "a social or marketplace page" : "a directory or social listing";
  const finding: AuditFindingInput = {
    checkId,
    severity: "HIGH",
    claim: claim.noWebsite(presence, ctx.clock.now()),
    evidence: { observations: [`websiteKind=${company.websiteKind}`] },
    sourceUrl: presenceUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "OBSERVED",
    confidence: 1,
    pitchable: true,
  };
  return Promise.resolve(ok(checkId, [finding]));
};

function pagespeedCheck(checkId: AuditCheckId, strategy: "mobile" | "desktop"): CheckFn {
  return async (company, ctx) => {
    const url = company.website;
    if (url === null) return notApplicable(checkId, "No website.");
    const cfg = await getAuditConfig();
    const { runPageSpeed } = await import("../providers/pagespeed");
    const scope = companyScopeKey(company);
    const { withDomainCache } = await import("../agents/support");
    const { value: psi } = await withDomainCache(ctx, scope, checkId, cfg.cacheTtlSeconds, () =>
      runPageSpeed(url, strategy),
    );
    const poor = psi.lcpMs > cfg.pagespeedMaxLcpMs || psi.performanceScore < cfg.pagespeedMinScore;
    if (!poor) return okEmpty(checkId, COST_MICROS.pagespeed);
    const severity = psi.performanceScore < 30 || psi.lcpMs > 6_000 ? "HIGH" : "MEDIUM";
    const finding: AuditFindingInput = {
      checkId,
      severity,
      claim: claim.pagespeed(strategy, psi.lcpMs, ctx.clock.now()),
      evidence: {
        metrics: {
          lcpSeconds: Number((psi.lcpMs / 1000).toFixed(1)),
          performanceScore: psi.performanceScore,
          cls: psi.cls,
          totalBytes: psi.totalBytes,
        },
        thresholds: { lcpSeconds: cfg.pagespeedMaxLcpMs / 1000, performanceScore: cfg.pagespeedMinScore },
      },
      sourceUrl: psi.reportUrl,
      capturedAt: ctx.clock.now().toISOString(),
      method: "MEASURED",
      confidence: 1,
      pitchable: true,
    };
    return ok(checkId, [finding], COST_MICROS.pagespeed);
  };
}

export const webPagespeedMobile = pagespeedCheck("web.pagespeed_mobile", "mobile");
export const webPagespeedDesktop = pagespeedCheck("web.pagespeed_desktop", "desktop");

export const webSsl: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.ssl";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const parsed = new URL(url);
  const now = ctx.clock.now();

  // HTTP → HTTPS redirect: fetch the http:// form and see where it lands.
  const httpUrl = `http://${parsed.host}${parsed.pathname}`;
  const httpResult = await ctx.safeFetch(httpUrl, { method: "HEAD", respectRobots: false });
  const redirectsToHttps = httpResult.finalUrl.startsWith("https://");

  const cert = await getCertInfo(parsed.hostname, now);
  const findings: AuditFindingInput[] = [];
  if (cert !== null && !cert.valid) {
    findings.push({
      checkId,
      severity: "HIGH",
      claim: claim.sslExpired(now),
      evidence: { observations: ["TLS certificate not valid"], ...(cert.validTo === null ? {} : { metrics: { validTo: cert.validTo.toISOString() } }) },
      sourceUrl: url,
      capturedAt: now.toISOString(),
      method: "MEASURED",
      confidence: 1,
      pitchable: true,
    });
  } else if (cert?.daysToExpiry !== null && cert?.daysToExpiry !== undefined && cert.daysToExpiry <= 21) {
    findings.push({
      checkId,
      severity: "MEDIUM",
      claim: claim.sslExpiring(cert.daysToExpiry, now),
      evidence: { metrics: { daysToExpiry: cert.daysToExpiry } },
      sourceUrl: url,
      capturedAt: now.toISOString(),
      method: "MEASURED",
      confidence: 1,
      pitchable: true,
    });
  }
  if (!redirectsToHttps && parsed.protocol === "http:") {
    findings.push({
      checkId,
      severity: "MEDIUM",
      claim: claim.sslNoRedirect(now),
      evidence: { observations: [`http did not redirect to https (landed on ${httpResult.finalUrl.slice(0, 120)})`] },
      sourceUrl: url,
      capturedAt: now.toISOString(),
      method: "MEASURED",
      confidence: 1,
      pitchable: true,
    });
  }
  return findings.length === 0 ? okEmpty(checkId) : ok(checkId, findings);
};

export const webMobileViewport: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.mobile_viewport";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const hasVp = hasViewportMeta(home.body);
  const capture = await getCapture(ctx, company, url, "mobile");
  if (hasVp) return okEmpty(checkId, capture === null ? 0 : COST_MICROS.capture);
  const finding: AuditFindingInput = {
    checkId,
    severity: "MEDIUM",
    claim: claim.viewport(ctx.clock.now()),
    evidence: {
      observations: ["No <meta name=viewport> tag on the homepage"],
      ...(capture?.screenshotKey === undefined
        ? {}
        : { artifacts: [{ key: capture.screenshotKey, label: "Mobile homepage", viewport: "mobile" as const }] }),
    },
    sourceUrl: url,
    ...(capture?.screenshotKey === undefined ? {} : { artifactKey: capture.screenshotKey }),
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
  };
  return ok(checkId, [finding], capture === null ? 0 : COST_MICROS.capture);
};

export const webBrokenLinks: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.broken_links";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const links = extractInternalLinks(home.body, home.finalUrl, 20);
  if (links.length === 0) return okEmpty(checkId);
  const failures: string[] = [];
  for (const link of links) {
    if (ctx.signal.aborted) break;
    const res = await ctx.safeFetch(link, { method: "HEAD", respectRobots: false });
    if (!res.ok || res.status >= 400) failures.push(link);
  }
  if (failures.length === 0) return okEmpty(checkId);
  const severity = failures.length >= 3 ? "MEDIUM" : "LOW";
  const finding: AuditFindingInput = {
    checkId,
    severity,
    claim: claim.brokenLinks(failures.length, links.length, ctx.clock.now()),
    evidence: {
      counts: { brokenLinks: failures.length, checked: links.length },
      observations: failures.slice(0, 5).map((l) => `broken: ${l.slice(0, 120)}`),
    },
    sourceUrl: url,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: failures.length >= 3,
  };
  return ok(checkId, [finding]);
};

export const webSeoBasics: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.seo_basics";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const missing: string[] = [];
  if (extractTitle(home.body) === null) missing.push("a page title");
  if (extractMetaDescription(home.body) === null) missing.push("a search description");
  if (countH1(home.body) !== 1) missing.push("a single main heading");
  if (!hasOpenGraph(home.body)) missing.push("social share tags");
  const origin = new URL(url).origin;
  const [sitemap, robots] = await Promise.all([
    ctx.safeFetch(`${origin}/sitemap.xml`, { method: "HEAD", respectRobots: false }),
    ctx.safeFetch(`${origin}/robots.txt`, { method: "HEAD", respectRobots: false }),
  ]);
  if (!sitemap.ok) missing.push("a sitemap");
  if (!robots.ok) missing.push("a robots file");
  if (missing.length === 0) return okEmpty(checkId);
  const severity = missing.includes("a page title") || missing.includes("a single main heading") ? "MEDIUM" : "LOW";
  const finding: AuditFindingInput = {
    checkId,
    severity,
    claim: claim.seoBasics(missing, ctx.clock.now()),
    evidence: { observations: missing.map((m) => `missing ${m}`), counts: { missing: missing.length } },
    sourceUrl: url,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const webOutdated: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.outdated";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const now = ctx.clock.now();
  const year = extractCopyrightYear(home.body);
  const hints = legacyTechHints(home.body);
  if (hasHttpForm(home.body)) hints.push("forms submitted over insecure http");
  const currentYear = now.getFullYear();
  if (year !== null && year < currentYear - 2) {
    const finding: AuditFindingInput = {
      checkId,
      severity: "LOW",
      claim: claim.outdatedYear(year, currentYear - year, now),
      evidence: { metrics: { copyrightYear: year }, ...(hints.length === 0 ? {} : { observations: hints }) },
      sourceUrl: url,
      capturedAt: now.toISOString(),
      method: "OBSERVED",
      confidence: 0.9,
      pitchable: true,
    };
    return ok(checkId, [finding]);
  }
  if (hints.length > 0) {
    const finding: AuditFindingInput = {
      checkId,
      severity: hints.some((h) => h.includes("http")) ? "MEDIUM" : "LOW",
      claim: claim.outdatedTech(hints, now),
      evidence: { observations: hints },
      sourceUrl: url,
      capturedAt: now.toISOString(),
      method: "OBSERVED",
      confidence: 0.8,
      pitchable: true,
    };
    return ok(checkId, [finding]);
  }
  return okEmpty(checkId);
};

export const webContactPath: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.contact_path";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const body = home.body.toLowerCase();
  const hasAffordance =
    /href=["'](mailto:|tel:)/.test(body) ||
    /href=["'][^"']*(contact|cart|checkout|basket|shop|book|enquire|inquiry|get-a-quote)/.test(body) ||
    /\b(contact us|get in touch|add to cart|buy now|book now|checkout)\b/.test(body);
  if (hasAffordance) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "MEDIUM",
    claim: claim.contactPath(ctx.clock.now()),
    evidence: { observations: ["No contact, enquiry or purchase link found on the homepage"] },
    sourceUrl: url,
    capturedAt: ctx.clock.now().toISOString(),
    method: "OBSERVED",
    confidence: 0.7,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const webVisualFirstImpression: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "web.visual_first_impression";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const [mobile, desktop] = await Promise.all([
    getCapture(ctx, company, url, "mobile"),
    getCapture(ctx, company, url, "desktop"),
  ]);
  const keys = [mobile?.screenshotKey, desktop?.screenshotKey].filter((k): k is string => k !== undefined);
  if (keys.length === 0) {
    if (mobile === null && desktop === null) return skippedCostCap(checkId);
    return notApplicable(checkId, "No screenshots were captured.");
  }
  const captureCost = (mobile === null ? 0 : COST_MICROS.capture) + (desktop === null ? 0 : COST_MICROS.capture);
  const images = await imagesFromArtifacts(keys);
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-web-first-impression",
    input: {
      serviceLine: ctx.lead.serviceLine,
      market: ctx.lead.market,
      pageUrl: url,
      screenshots: keys.map((key, i) => ({ viewport: i === 0 && mobile?.screenshotKey === key ? ("mobile" as const) : ("desktop" as const), artifactKey: key })),
    },
    allowedRefs: keys,
    estimatedCostMicros: COST_MICROS.aiVision,
    images,
    build: (f) => buildVisionFinding(checkId, f, ctx, { artifactKeys: keys }),
  });
  if (result.status === "skipped") return skippedCostCap(checkId);
  return ok(checkId, result.findings, captureCost + result.costMicros);
};

/** Maps an AI finding whose refs are artifact keys to an AuditFindingInput. */
export function buildVisionFinding(
  checkId: AuditCheckId,
  f: { claim: string; evidenceRefs: string[]; severity: AuditFindingInput["severity"]; confidence: number },
  ctx: AuditContext,
  opts: { artifactKeys: string[] },
): AuditFindingInput | null {
  const artifactKey = f.evidenceRefs.find((r) => opts.artifactKeys.includes(r));
  if (artifactKey === undefined) return null;
  const pitchable = f.confidence >= 0.7 && (f.severity === "CRITICAL" || f.severity === "HIGH" || f.severity === "MEDIUM");
  return {
    checkId,
    severity: f.severity,
    claim: f.claim,
    evidence: {
      referenceIds: f.evidenceRefs,
      artifacts: f.evidenceRefs
        .filter((r) => opts.artifactKeys.includes(r))
        .map((key) => ({ key, label: "Captured screenshot" })),
    },
    artifactKey,
    capturedAt: ctx.clock.now().toISOString(),
    method: "AI_JUDGED",
    confidence: f.confidence,
    pitchable,
  };
}

/** Returns true when this agent's non-no_website checks apply (there is a real website). */
export function webChecksApply(company: AuditCompanyInput): boolean {
  return hasRealWebsite(company);
}

export const WEB_CHECK_FNS: Record<string, CheckFn> = {
  "web.no_website": webNoWebsite,
  "web.pagespeed_mobile": webPagespeedMobile,
  "web.pagespeed_desktop": webPagespeedDesktop,
  "web.ssl": webSsl,
  "web.mobile_viewport": webMobileViewport,
  "web.broken_links": webBrokenLinks,
  "web.seo_basics": webSeoBasics,
  "web.outdated": webOutdated,
  "web.contact_path": webContactPath,
  "web.visual_first_impression": webVisualFirstImpression,
};

export type { CheckOutcome };
