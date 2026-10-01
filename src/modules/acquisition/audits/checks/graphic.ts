/**
 * Graphic Design checks (`audit.graphic`): collect public brand surfaces (captures + og/favicon +
 * YouTube art), AI consistency over them, logo resolution, and social-presence fit. Nothing requires
 * a login (INV-14); platforms with no compliant source are recorded as NOT_ASSESSED.
 */

import "server-only";

import { env } from "@/env";
import type { AuditCheckId, AuditCompanyInput, AuditContext, AuditFindingInput } from "@/contracts/audit-agent";

import { imagesFromArtifacts, runAuditAiFindings } from "../ai/run";
import { claim } from "../claims/templates";
import { buildVisionFinding } from "./web";
import { companyScopeKey, getCapture, getHomepage } from "./capture-helpers";
import { COST_MICROS } from "./cost";
import { extractFavicon, extractOgImage } from "./html";
import { fetchImageGuarded } from "./fetch-image";
import {
  checkFailed,
  notApplicable,
  notAssessed,
  ok,
  okEmpty,
  skippedCostCap,
  type CheckFn,
} from "./types";

interface Surface {
  key: string;
  label: string;
  sourceUrl?: string;
}

function surfacesCacheKey(company: AuditCompanyInput): string {
  return `${companyScopeKey(company)}:brand-surfaces`;
}

export const graphicBrandSurfaces: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "graphic.brand_surfaces";
  const url = company.website;
  const youtube = company.socials.youtube;
  if (url === null && youtube === undefined) return notApplicable(checkId, "No website or YouTube channel.");

  const surfaces: Surface[] = [];
  const observations: string[] = [];
  let cost = 0;

  if (url !== null) {
    const desktop = await getCapture(ctx, company, url, "desktop");
    if (desktop === null) return skippedCostCap(checkId);
    cost += COST_MICROS.capture;
    if (desktop.screenshotKey !== undefined) {
      surfaces.push({ key: desktop.screenshotKey, label: "Homepage (desktop)", sourceUrl: url });
    }
    const home = await getHomepage(ctx, company, url);
    if (home.body !== null) {
      const og = extractOgImage(home.body);
      const favicon = extractFavicon(home.body, home.finalUrl);
      for (const [imgUrl, label] of [
        [og, "og:image"],
        [favicon, "favicon"],
      ] as const) {
        if (imgUrl === null) continue;
        observations.push(`${label}: ${imgUrl.slice(0, 160)}`);
        const stored = await storeBrandImage(ctx, company, imgUrl, label);
        if (stored !== null) surfaces.push({ key: stored, label, sourceUrl: imgUrl });
      }
    }
  }
  if (youtube !== undefined) {
    observations.push(`YouTube channel: ${youtube.slice(0, 160)}`);
  }

  await ctx.cache.set(surfacesCacheKey(company), { surfaces }, 7 * 24 * 60 * 60);

  if (surfaces.length === 0 && observations.length === 0) {
    return notAssessed(checkId, "No compliant brand surfaces were reachable without login.");
  }
  return okEmpty(checkId, cost);
};

/** Downloads and stores a brand image as an artifact. Skipped under MOCKS (no real network in tests). */
async function storeBrandImage(
  ctx: AuditContext,
  company: AuditCompanyInput,
  imgUrl: string,
  label: string,
): Promise<string | null> {
  if (env.MOCKS) return null;
  const image = await fetchImageGuarded(imgUrl);
  if (image === null) return null;
  const scope = companyScopeKey(company);
  const key = `audit-brand/${scope}/${label}-${crypto.randomUUID()}`;
  const stored = await ctx.storage.putFile({
    key,
    body: image.bytes,
    contentType: image.contentType,
    access: "private",
    purpose: "AUDIT_SCREENSHOT",
  });
  return stored.key;
}

async function readSurfaces(ctx: AuditContext, company: AuditCompanyInput): Promise<Surface[]> {
  const cached = await ctx.cache.get(surfacesCacheKey(company));
  if (cached !== null && typeof cached === "object" && "surfaces" in cached) {
    const value = (cached as { surfaces: Surface[] }).surfaces;
    if (Array.isArray(value)) return value;
  }
  return [];
}

export const graphicConsistency: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "graphic.consistency";
  const surfaces = await readSurfaces(ctx, company);
  const keys = surfaces.map((s) => s.key);
  if (keys.length === 0) return notAssessed(checkId, "No brand surfaces were collected to compare.");
  const images = await imagesFromArtifacts(keys);
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-graphic-consistency",
    input: {
      serviceLine: ctx.lead.serviceLine,
      market: ctx.lead.market,
      surfaces: surfaces.map((s) => ({ artifactKey: s.key, label: s.label, ...(s.sourceUrl === undefined ? {} : { sourceUrl: s.sourceUrl }) })),
    },
    allowedRefs: keys,
    estimatedCostMicros: COST_MICROS.aiVision,
    images,
    build: (f) => buildVisionFinding(checkId, f, ctx, { artifactKeys: keys }),
  });
  if (result.status === "skipped") return skippedCostCap(checkId);
  return ok(checkId, result.findings, result.costMicros);
};

export const graphicLogoQuality: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "graphic.logo_quality";
  const url = company.website;
  if (url === null) return notApplicable(checkId, "No website.");
  if (env.MOCKS) return notAssessed(checkId, "Logo file not retrieved under mock mode.");
  const home = await getHomepage(ctx, company, url);
  if (home.body === null) return checkFailed(checkId, `Homepage fetch failed (${home.blockedReason ?? String(home.status)}).`);
  const logoUrl = extractOgImage(home.body) ?? extractFavicon(home.body, home.finalUrl);
  if (logoUrl === null) return notAssessed(checkId, "No logo or og:image found on the homepage.");
  const image = await fetchImageGuarded(logoUrl);
  if (image === null) return notAssessed(checkId, "Logo could not be retrieved without login.");
  const sharp = (await import("sharp")).default;
  const meta = await sharp(Buffer.from(image.bytes)).metadata();
  const width = meta.width;
  const height = meta.height;
  if (width >= 200 && height >= 200) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: claim.logoLowRes(width, height, ctx.clock.now()),
    evidence: { metrics: { width, height, format: meta.format } },
    sourceUrl: logoUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 0.9,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const graphicSocialPresenceFit: CheckFn = (company, ctx) => {
  const checkId: AuditCheckId = "graphic.social_presence_fit";
  const platforms = Object.entries(company.socials)
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([k]) => k);
  const anyUrl = Object.values(company.socials).find((v): v is string => typeof v === "string" && v.length > 0);
  if (anyUrl === undefined) return Promise.resolve(notApplicable(checkId, "No public social profiles found."));
  if (platforms.length >= 2) return Promise.resolve(okEmpty(checkId));
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: `Your brand appears on only ${String(platforms.length)} social platform (${platforms.join(", ")}), which limits how consistently people recognise you.`,
    evidence: { observations: platforms.map((p) => `present: ${p}`), counts: { platforms: platforms.length } },
    sourceUrl: anyUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "OBSERVED",
    confidence: 0.7,
    pitchable: false,
  };
  return Promise.resolve(ok(checkId, [finding]));
};

export const GRAPHIC_CHECK_FNS: Record<string, CheckFn> = {
  "graphic.brand_surfaces": graphicBrandSurfaces,
  "graphic.consistency": graphicConsistency,
  "graphic.logo_quality": graphicLogoQuality,
  "graphic.social_presence_fit": graphicSocialPresenceFit,
};
