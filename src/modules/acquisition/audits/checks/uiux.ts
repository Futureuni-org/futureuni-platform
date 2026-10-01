/**
 * UI/UX Design checks (`audit.uiux`): App Store review analysis (AI over measured data), onboarding
 * capture, heuristics (AI vision), accessibility (axe) and mobile layout.
 */

import "server-only";

import type { AuditCheckId, AuditCompanyInput, AuditFindingInput } from "@/contracts/audit-agent";

import { imagesFromArtifacts, runAuditAiFindings } from "../ai/run";
import { claim } from "../claims/templates";
import { buildVisionFinding } from "./web";
import { getCapture, getHomepage } from "./capture-helpers";
import { COST_MICROS } from "./cost";
import { hasViewportMeta } from "./html";
import {
  checkFailed,
  notApplicable,
  ok,
  okEmpty,
  skippedCostCap,
  type CheckFn,
} from "./types";

/** Resolves an App Store app id from the company's external references, if any. */
function appStoreRef(company: AuditCompanyInput): { appId: string; url: string } | null {
  const ref = company.externalRefs.find((r) => r.adapterId === "apple-app-store");
  if (ref === undefined) return null;
  return { appId: ref.externalId, url: ref.url ?? `https://apps.apple.com/app/id${ref.externalId}` };
}

export const uiuxAppReviews: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "uiux.app_reviews";
  const app = appStoreRef(company);
  if (app === null) return notApplicable(checkId, "No App Store app linked to this company.");
  const { getAppStoreReviews } = await import("../providers/app-store");
  const { withDomainCache } = await import("../agents/support");
  const { value: reviews } = await withDomainCache(ctx, `app:${app.appId}`, checkId, 7 * 24 * 60 * 60, () =>
    getAppStoreReviews(app.appId),
  );
  if (reviews === null || reviews.reviews.length === 0) {
    return notApplicable(checkId, "No reviews available for this app.");
  }
  const byId = new Map(reviews.reviews.map((r) => [r.id, r]));
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-uiux-review-analysis",
    input: {
      serviceLine: ctx.lead.serviceLine,
      market: ctx.lead.market,
      appName: company.name,
      reviews: reviews.reviews.slice(0, 30).map((r) => ({ id: r.id, rating: r.rating, text: r.text })),
    },
    allowedRefs: reviews.reviews.map((r) => r.id),
    estimatedCostMicros: COST_MICROS.aiText,
    build: (f) => {
      const quotes = f.evidenceRefs
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => r !== undefined)
        .slice(0, 5)
        .map((r) => ({ refId: r.id, text: r.text.slice(0, 500) }));
      const pitchable = f.confidence >= 0.7 && (f.severity === "CRITICAL" || f.severity === "HIGH" || f.severity === "MEDIUM");
      const finding: AuditFindingInput = {
        checkId,
        severity: f.severity,
        claim: f.claim,
        evidence: {
          referenceIds: f.evidenceRefs,
          quotes,
          metrics: { averageRating: reviews.averageRating ?? 0, reviewsAnalysed: reviews.reviews.length },
        },
        sourceUrl: app.url,
        capturedAt: ctx.clock.now().toISOString(),
        method: "AI_JUDGED",
        confidence: f.confidence,
        pitchable,
      };
      return finding;
    },
  });
  if (result.status === "skipped") return skippedCostCap(checkId);
  return ok(checkId, result.findings, result.costMicros);
};

const ONBOARDING_ACTIONS = [
  { type: "click-text" as const, text: "Sign up" },
  { type: "click-text" as const, text: "Get started" },
];

export const uiuxOnboardingCapture: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "uiux.onboarding_capture";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const landing = await getCapture(ctx, company, url, "mobile", { collect: { html: true } });
  if (landing === null) return skippedCostCap(checkId);
  if (!landing.ok || landing.screenshotKey === undefined) {
    return checkFailed(checkId, `Landing capture failed (${landing.blockedReason ?? "no screenshot"}).`);
  }
  const step = await getCapture(ctx, company, url, "mobile", { collect: { html: true }, actions: ONBOARDING_ACTIONS });
  const fieldCount = step?.html === undefined ? 0 : countFormFields(step.html);
  const steps = step === null ? 1 : 2;
  if (fieldCount <= 6) return okEmpty(checkId, COST_MICROS.capture * steps);
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: `Your sign-up asks for ${String(fieldCount)} fields across ${String(steps)} steps, which can lose people before they finish.`,
    evidence: {
      counts: { fields: fieldCount, steps },
      artifacts: [{ key: landing.screenshotKey, label: "Landing page", viewport: "mobile" }],
    },
    artifactKey: landing.screenshotKey,
    capturedAt: ctx.clock.now().toISOString(),
    method: "OBSERVED",
    confidence: 0.8,
    pitchable: true,
  };
  return ok(checkId, [finding], COST_MICROS.capture * steps);
};

function countFormFields(html: string): number {
  const tags = html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? [];
  return tags.filter((t) => !/type=["'](hidden|submit|button|reset)["']/i.test(t)).length;
}

export const uiuxHeuristics: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "uiux.heuristics";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const landing = await getCapture(ctx, company, url, "mobile", { collect: { html: true } });
  const step = await getCapture(ctx, company, url, "mobile", { collect: { html: true }, actions: ONBOARDING_ACTIONS });
  const keys = [landing?.screenshotKey, step?.screenshotKey].filter((k): k is string => k !== undefined);
  if (keys.length === 0) {
    if (landing === null && step === null) return skippedCostCap(checkId);
    return checkFailed(checkId, "No onboarding screenshots to assess.");
  }
  const images = await imagesFromArtifacts(keys);
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-uiux-heuristics",
    input: {
      serviceLine: ctx.lead.serviceLine,
      market: ctx.lead.market,
      steps: keys.map((key, i) => ({ artifactKey: key, label: i === 0 ? "Landing" : "Next step" })),
    },
    allowedRefs: keys,
    estimatedCostMicros: COST_MICROS.aiVision,
    images,
    build: (f) => buildVisionFinding(checkId, f, ctx, { artifactKeys: keys }),
  });
  if (result.status === "skipped") return skippedCostCap(checkId);
  return ok(checkId, result.findings, result.costMicros);
};

export const uiuxAccessibility: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "uiux.accessibility";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const capture = await getCapture(ctx, company, url, "desktop", { collect: { axe: true } });
  if (capture === null) return skippedCostCap(checkId);
  if (!capture.ok || capture.axeViolations === undefined) {
    return checkFailed(checkId, `Accessibility capture failed (${capture.blockedReason ?? "no axe results"}).`);
  }
  const violations = capture.axeViolations;
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const totalNodes = violations.reduce((sum, v) => sum + v.nodes, 0);
  if (serious.length === 0) return okEmpty(checkId, COST_MICROS.capture);
  const finding: AuditFindingInput = {
    checkId,
    severity: serious.length >= 5 ? "HIGH" : "MEDIUM",
    claim: claim.accessibility(serious.length, ctx.clock.now()),
    evidence: {
      counts: { seriousOrCritical: serious.length, totalViolations: violations.length, affectedElements: totalNodes },
      observations: serious.slice(0, 5).map((v) => `${v.id}: ${v.help}`),
      ...(capture.screenshotKey === undefined ? {} : { artifacts: [{ key: capture.screenshotKey, label: "Landing page", viewport: "desktop" as const }] }),
    },
    sourceUrl: url,
    ...(capture.screenshotKey === undefined ? {} : { artifactKey: capture.screenshotKey }),
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
  };
  return ok(checkId, [finding], COST_MICROS.capture);
};

export const uiuxMobileLayout: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "uiux.mobile_layout";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const capture = await getCapture(ctx, company, url, "mobile");
  const noViewport = !hasViewportMeta(home.body);
  const fixedWidth = /(?:width\s*:\s*(?:9\d\d|1\d{3,})px)|<table[^>]+width=["']?(?:9\d\d|1\d{3,})/i.test(home.body);
  if (!noViewport && !fixedWidth) return okEmpty(checkId, capture === null ? 0 : COST_MICROS.capture);
  const finding: AuditFindingInput = {
    checkId,
    severity: "MEDIUM",
    claim: claim.mobileOverflow(ctx.clock.now()),
    evidence: {
      observations: [noViewport ? "No mobile viewport tag" : "Fixed desktop-width layout detected"],
      ...(capture?.screenshotKey === undefined ? {} : { artifacts: [{ key: capture.screenshotKey, label: "Mobile homepage", viewport: "mobile" as const }] }),
    },
    sourceUrl: url,
    ...(capture?.screenshotKey === undefined ? {} : { artifactKey: capture.screenshotKey }),
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 0.7,
    pitchable: true,
  };
  return ok(checkId, [finding], capture === null ? 0 : COST_MICROS.capture);
};

export const UIUX_CHECK_FNS: Record<string, CheckFn> = {
  "uiux.app_reviews": uiuxAppReviews,
  "uiux.onboarding_capture": uiuxOnboardingCapture,
  "uiux.heuristics": uiuxHeuristics,
  "uiux.accessibility": uiuxAccessibility,
  "uiux.mobile_layout": uiuxMobileLayout,
};
