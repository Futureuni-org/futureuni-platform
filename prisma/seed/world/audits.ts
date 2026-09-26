/**
 * Audits, check runs, findings, cache entries and screenshot files (data-model §10.6). Every lead
 * that reached AUDITED has one audit by its line's agent; leads still AUDITING have a running one.
 * About 120 findings, each validated with the audit-agent contract (INV-5, INV-18).
 */

import type { ServiceLine } from "@/contracts/common";
import {
  AuditFindingInputSchema,
  type AuditCheckId,
  type AuditFindingInput,
} from "@/contracts/audit-agent";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { seedId } from "../lib/ids";
import { fixtureInfo, type FixtureName } from "../lib/storage";

import { formatDay, passed, timeOf, userId, type LeadInfo, type Row } from "./base";
import { lacksHttps } from "./directory";

export interface SeedFile {
  row: Row<Prisma.FileObjectUncheckedCreateInput>;
  fixture: FixtureName;
}

export interface AuditsWorld {
  audits: Row<Prisma.AuditUncheckedCreateInput>[];
  checkRuns: Row<Prisma.AuditCheckRunUncheckedCreateInput>[];
  findings: Row<Prisma.AuditFindingUncheckedCreateInput>[];
  cacheEntries: Row<Prisma.AuditCacheEntryUncheckedCreateInput>[];
  files: SeedFile[];
  /** Citable findings per lead number: not dismissed, pitchable ones first. */
  citableFindings: ReadonlyMap<number, readonly string[]>;
}

export const AGENT_FOR_LINE = {
  WEB_DEVELOPMENT: "audit.web",
  UI_UX_DESIGN: "audit.uiux",
  GRAPHIC_DESIGN: "audit.graphic",
  VIDEO_EDITING: "audit.video",
} as const satisfies Record<ServiceLine, string>;

const CHECKS: Readonly<Record<ServiceLine, readonly AuditCheckId[]>> = {
  WEB_DEVELOPMENT: [
    "web.pagespeed_mobile",
    "web.ssl",
    "web.mobile_viewport",
    "web.contact_path",
    "web.seo_basics",
  ],
  UI_UX_DESIGN: [
    "uiux.app_reviews",
    "uiux.onboarding_capture",
    "uiux.heuristics",
    "uiux.accessibility",
    "uiux.mobile_layout",
  ],
  GRAPHIC_DESIGN: [
    "graphic.consistency",
    "graphic.logo_quality",
    "graphic.brand_surfaces",
    "graphic.social_presence_fit",
  ],
  VIDEO_EDITING: ["video.captions", "video.cadence", "video.thumbnails", "video.titles_hooks"],
};

const NO_WEBSITE_CHECKS: readonly AuditCheckId[] = [
  "web.no_website",
  "web.pagespeed_mobile",
  "web.ssl",
  "web.mobile_viewport",
  "web.visual_first_impression",
];

type CheckOutcome =
  | {
      status: "OK";
      finding: Omit<AuditFindingInput, "checkId" | "capturedAt"> | null;
      screenshot?: FixtureName;
    }
  | { status: "NOT_APPLICABLE" | "NOT_ASSESSED" | "CHECK_FAILED"; reason: string };

const INSTAGRAM_NOT_ASSESSED = "not assessed: no compliant data source (Instagram)";

function pageUrl(lead: LeadInfo, path = "/"): string {
  return `https://${lead.company.domain ?? "example.com"}${path}`;
}

function channelUrl(lead: LeadInfo): string {
  return (
    lead.company.socials?.youtube ??
    `https://youtube.example.com/channel/${lead.company.channelId ?? String(lead.n)}`
  );
}

/** What each check found for this lead. `key` is the screenshot's storage key, when it has one. */
function outcome(lead: LeadInfo, checkId: AuditCheckId, date: string, key: string): CheckOutcome {
  const v = lead.n;
  const company = lead.company;
  switch (checkId) {
    // ---- Web ----
    case "web.no_website":
      return {
        status: "OK",
        finding: {
          severity: "HIGH",
          claim:
            "We couldn't find a website for the business; people searching for it find only its Instagram page.",
          evidence: {
            observations: ["No website on the Google Maps listing or the Instagram profile"],
          },
          sourceUrl: company.socials?.instagram ?? pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    case "web.visual_first_impression":
      return { status: "NOT_ASSESSED", reason: INSTAGRAM_NOT_ASSESSED };
    case "web.pagespeed_mobile": {
      if (company.domain === null)
        return { status: "NOT_APPLICABLE", reason: "No website to measure" };
      const lcp = Math.round((4.6 + (v % 6) * 0.52) * 10) / 10;
      return {
        status: "OK",
        screenshot: "screenshotMobile",
        finding: {
          severity: "HIGH",
          claim: `Your homepage took ${lcp.toFixed(1)}s to show its main content on mobile in our test on ${date}.`,
          evidence: {
            metrics: { lcpSeconds: lcp, performanceScore: 22 + (v % 30) },
            thresholds: { lcpSeconds: 4 },
            artifacts: [{ key, label: "Homepage on a mid-range phone", viewport: "mobile" }],
          },
          sourceUrl: `https://pagespeed.example.com/analysis?url=${encodeURIComponent(pageUrl(lead))}`,
          artifactKey: key,
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "web.ssl":
      if (company.domain === null)
        return { status: "NOT_APPLICABLE", reason: "No website to check" };
      if (!lacksHttps(company)) return { status: "OK", finding: null };
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim: "The site has no SSL certificate, so browsers mark it 'Not secure'.",
          evidence: {
            observations: [
              `https://${company.domain} refused the connection`,
              "The http:// address loads without redirecting",
            ],
          },
          sourceUrl: `http://${company.domain}/`,
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    case "web.mobile_viewport":
      if (company.domain === null)
        return { status: "NOT_APPLICABLE", reason: "No website to check" };
      if (v % 3 === 0) return { status: "OK", finding: null };
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim:
            "The homepage has no mobile viewport setting, so phones show a shrunken desktop page.",
          evidence: { observations: ["No <meta name=viewport> tag in the homepage HTML"] },
          sourceUrl: pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    case "web.contact_path":
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim: "The contact page has a form but no phone number or WhatsApp link.",
          evidence: {
            observations: ["Contact page: form only", "No tel: or wa.me link on any page checked"],
          },
          sourceUrl: pageUrl(lead, "/contact"),
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    case "web.seo_basics": {
      const checked = 8 + (v % 5);
      const missing = 3 + (v % 4);
      return {
        status: "OK",
        finding: {
          severity: "LOW",
          claim: `${String(missing)} of the ${String(checked)} pages we checked have no meta description.`,
          evidence: { counts: { missing, checked } },
          sourceUrl: pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: false,
        },
      };
    }
    // ---- UI/UX ----
    case "uiux.app_reviews": {
      if (v === KEY_LEADS.checkFailed)
        return { status: "CHECK_FAILED", reason: "The App Store reviews feed timed out twice" };
      if (company.source !== "apple-app-store")
        return { status: "NOT_APPLICABLE", reason: "No app found in the App Store" };
      const mentions = 6 + (v % 11);
      const appUrl = `https://apps.example.com/app/id${String(6_400_000_000 + company.n)}`;
      return {
        status: "OK",
        finding: {
          severity: "HIGH",
          claim: `App Store reviews in the last 90 days mention sign-up problems ${String(mentions)} times.`,
          evidence: {
            counts: { mentions, reviewsRead: 60 + (v % 40) },
            quotes: [
              {
                refId: `review-${String(v)}-1`,
                text: "Couldn't get past the verification step, it just spins.",
                sourceUrl: appUrl,
              },
              {
                refId: `review-${String(v)}-2`,
                text: "Too many screens before I can even look around.",
                sourceUrl: appUrl,
              },
            ],
          },
          sourceUrl: appUrl,
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "uiux.onboarding_capture": {
      const steps = 6 + (v % 4);
      return {
        status: "OK",
        screenshot: "screenshotMobile",
        finding: {
          severity: "MEDIUM",
          claim: `Signing up takes ${String(steps)} screens before the app shows anything useful.`,
          evidence: {
            counts: { screens: steps },
            artifacts: [{ key, label: "Sign-up flow, screen by screen", viewport: "mobile" }],
          },
          artifactKey: key,
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "uiux.accessibility": {
      const failing = 5 + (v % 9);
      return {
        status: "OK",
        finding: {
          severity: "HIGH",
          claim: `${String(failing)} text elements on the home screen fall below the WCAG AA contrast ratio.`,
          evidence: {
            counts: { failing, checked: failing + 40 },
            thresholds: { contrastRatio: 4.5 },
          },
          sourceUrl: pageUrl(lead),
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "uiux.heuristics":
      return {
        status: "OK",
        screenshot: "screenshotMobile",
        finding: {
          severity: "MEDIUM",
          claim: "Primary buttons use three different styles across the sign-up screens.",
          evidence: {
            observations: ["Filled, outlined and text-only primary buttons"],
            referenceIds: [key],
          },
          artifactKey: key,
          method: "AI_JUDGED",
          confidence: 0.78,
          pitchable: true,
        },
      };
    case "uiux.mobile_layout":
      return {
        status: "OK",
        finding: {
          severity: "LOW",
          claim: "The pricing table overflows the screen on a 360px-wide phone.",
          evidence: { observations: ["Horizontal scroll on the pricing page at 360px"] },
          sourceUrl: pageUrl(lead, "/pricing"),
          method: "OBSERVED",
          confidence: 1,
          pitchable: false,
        },
      };
    // ---- Graphic ----
    case "graphic.consistency": {
      const surfaces =
        company.socials?.youtube === undefined
          ? "your website and Instagram"
          : "your website, Instagram and YouTube";
      return {
        status: "OK",
        screenshot: "screenshotDesktop",
        finding: {
          severity: "MEDIUM",
          claim: `Your logo appears in three different colour treatments across ${surfaces}.`,
          evidence: {
            counts: { treatments: 3 },
            artifacts: [{ key, label: "Logo on each surface, side by side" }],
          },
          artifactKey: key,
          sourceUrl:
            company.domain === null ? (company.socials?.instagram ?? pageUrl(lead)) : pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "graphic.logo_quality":
      if (company.domain === null)
        return { status: "NOT_APPLICABLE", reason: "No website to inspect" };
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim:
            "The logo on the website is a low-resolution image that blurs on high-density screens.",
          evidence: { metrics: { logoWidthPx: 120, displayedWidthPx: 240 } },
          sourceUrl: pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: true,
        },
      };
    case "graphic.brand_surfaces": {
      const found = 3 + (v % 3);
      return {
        status: "OK",
        finding: {
          severity: "LOW",
          claim: `We found your brand on ${String(found)} surfaces; 2 of them use a different typeface.`,
          evidence: { counts: { surfaces: found, differentTypeface: 2 } },
          sourceUrl: pageUrl(lead),
          method: "OBSERVED",
          confidence: 1,
          pitchable: false,
        },
      };
    }
    case "graphic.social_presence_fit":
      if (company.socials?.instagram !== undefined)
        return { status: "NOT_ASSESSED", reason: INSTAGRAM_NOT_ASSESSED };
      return { status: "NOT_APPLICABLE", reason: "No social profiles found" };
    // ---- Video ----
    case "video.captions": {
      const captioned = 1 + (v % 6);
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim: `${String(captioned)} of your last 20 videos have captions.`,
          evidence: { counts: { captioned, checked: 20 } },
          sourceUrl: channelUrl(lead),
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "video.cadence": {
      const days = 18 + (v % 25);
      const every = 4 + (v % 4);
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim: `Your last upload was ${String(days)} days ago; before that you posted every ${String(every)} days.`,
          evidence: {
            metrics: { daysSinceLastUpload: days, medianGapDays: every },
            sampleSize: 20,
          },
          sourceUrl: channelUrl(lead),
          method: "MEASURED",
          confidence: 1,
          pitchable: true,
        },
      };
    }
    case "video.thumbnails":
      return {
        status: "OK",
        finding: {
          severity: "MEDIUM",
          claim: "Thumbnails on your last 12 videos use four different text styles.",
          evidence: {
            referenceIds: [0, 1, 2].map(
              (i) =>
                `https://img.youtube.example.com/vi/seed${String(v)}x${String(i)}/hqdefault.jpg`,
            ),
            sampleSize: 12,
          },
          sourceUrl: channelUrl(lead),
          method: "AI_JUDGED",
          confidence: 0.8,
          pitchable: true,
        },
      };
    case "video.titles_hooks":
      return {
        status: "OK",
        finding: {
          severity: "LOW",
          claim: "Most of your recent titles don't say what the viewer will get from the video.",
          evidence: { referenceIds: [`${channelUrl(lead)}/videos`], sampleSize: 12 },
          sourceUrl: channelUrl(lead),
          method: "AI_JUDGED",
          confidence: 0.72,
          pitchable: false,
        },
      };
    default:
      return { status: "NOT_APPLICABLE", reason: "Not part of this seed" };
  }
}

export function buildAudits(leads: readonly LeadInfo[]): AuditsWorld {
  const citable = new Map<number, string[]>();
  const world: Omit<AuditsWorld, "citableFindings"> = {
    audits: [],
    checkRuns: [],
    findings: [],
    cacheEntries: [],
    files: [],
  };

  for (const lead of leads) {
    if (!passed(lead, "AUDITING")) continue;
    const startedAt = timeOf(lead, "AUDITING");
    if (startedAt === null) continue;
    const finishedAt = timeOf(lead, "AUDITED");
    const running = finishedAt === null;
    const auditId = seedId("audt", world.audits.length + 1);
    const line = lead.spec.line;
    const checks =
      line === "WEB_DEVELOPMENT" && lead.company.domain === null ? NO_WEBSITE_CHECKS : CHECKS[line];
    // A running audit has finished its first two checks.
    const done = running ? checks.slice(0, 2) : checks;
    const capturedAt = new Date(startedAt.getTime() + 20 * 60_000);
    const date = formatDay(capturedAt);
    const maxFindings = lead.n % 4 === 0 ? 3 : 2;
    let findingsForLead = 0;
    let failed = false;

    for (const checkId of done) {
      const key = `seed/screenshots/lead-${String(lead.n)}-${checkId.replace(".", "-")}.png`;
      const result = outcome(lead, checkId, date, key);
      world.checkRuns.push({
        id: seedId("achk", world.checkRuns.length + 1),
        auditId,
        checkId,
        status: result.status,
        reason: result.status === "OK" ? null : result.reason,
        durationMs: 1_800 + ((lead.n * 131 + checkId.length * 17) % 9_000),
        costMicros:
          checkId === "uiux.heuristics" ||
          checkId === "video.thumbnails" ||
          checkId === "video.titles_hooks"
            ? 2_400
            : 0,
        createdAt: capturedAt,
      });
      if (result.status === "CHECK_FAILED") failed = true;
      if (
        result.status !== "OK" ||
        result.finding === null ||
        running ||
        findingsForLead >= maxFindings
      )
        continue;

      const input = AuditFindingInputSchema.parse({
        ...result.finding,
        checkId,
        capturedAt: capturedAt.toISOString(),
      });
      const findingId = seedId("afnd", world.findings.length + 1);
      const dismissed = lead.n === KEY_LEADS.dismissedFinding && checkId === "uiux.heuristics";
      world.findings.push({
        id: findingId,
        auditId,
        leadId: lead.id,
        companyId: lead.companyId,
        checkId,
        severity: input.severity,
        claim: input.claim,
        evidence: toJsonInput(input.evidence),
        sourceUrl: input.sourceUrl ?? null,
        artifactKey: input.artifactKey ?? null,
        capturedAt,
        method: input.method,
        confidence: input.confidence,
        pitchable: input.pitchable,
        ...(dismissed
          ? {
              dismissedAt: new Date(capturedAt.getTime() + 86_400_000),
              dismissedById: userId("uiuxLead"),
              dismissReason:
                "The mixed button styles are an intentional brand pattern, not a usability problem.",
            }
          : {}),
        createdAt: capturedAt,
      });
      findingsForLead += 1;
      if (input.artifactKey !== undefined && result.screenshot !== undefined) {
        world.files.push({
          fixture: result.screenshot,
          row: {
            id: seedId("file", world.files.length + 1),
            key: input.artifactKey,
            purpose: "AUDIT_SCREENSHOT",
            access: "PRIVATE",
            ...fixtureInfo(result.screenshot),
            module: "acquisition",
            createdAt: capturedAt,
          },
        });
      }
      if (!dismissed) {
        const list = citable.get(lead.n) ?? [];
        if (input.pitchable) list.unshift(findingId);
        else list.push(findingId);
        citable.set(lead.n, list);
      }
      if (checkId === "web.pagespeed_mobile" && lead.company.domain !== null) {
        world.cacheEntries.push({
          id: seedId("acch", world.cacheEntries.length + 1),
          cacheKey: `${lead.company.domain}:${checkId}`,
          domain: lead.company.domain,
          checkId,
          result: toJsonInput(input.evidence),
          capturedAt,
          expiresAt: new Date(capturedAt.getTime() + 7 * 86_400_000),
          createdAt: capturedAt,
        });
      }
    }

    world.audits.push({
      id: auditId,
      leadId: lead.id,
      companyId: lead.companyId,
      agentId: AGENT_FOR_LINE[line],
      serviceLine: line,
      status: running ? "RUNNING" : failed ? "PARTIAL" : "SUCCEEDED",
      attempt: 1,
      startedAt,
      finishedAt: running ? null : finishedAt,
      costMicros: running ? 0 : 1_500 + (lead.n % 5) * 400,
      error: failed ? "1 check failed; the audit finished without it" : null,
      // The running web audit belongs to the running audits job (JobRun 15 in platform.ts).
      jobRunId: running && line === "WEB_DEVELOPMENT" ? seedId("jobr", 15) : null,
      createdAt: startedAt,
    });
  }
  return { ...world, citableFindings: citable };
}
