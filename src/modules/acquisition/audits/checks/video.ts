/**
 * Video Editing checks (`audit.video`): cadence, captions, duration profile and engagement from the
 * YouTube Data API; thumbnails (AI vision) and titles (AI text). Instagram and TikTok have no
 * compliant public source and are never scraped (INV-14) — the agent records them as NOT_ASSESSED.
 */

import "server-only";

import type { AuditCheckId, AuditCompanyInput, AuditContext, AuditFindingInput } from "@/contracts/audit-agent";

import { getAuditConfig } from "../config";
import { runAuditAiFindings } from "../ai/run";
import { claim } from "../claims/templates";
import { COST_MICROS } from "./cost";
import {
  notApplicable,
  notAssessed,
  ok,
  okEmpty,
  skippedCostCap,
  type CheckFn,
} from "./types";
import type { YouTubeChannel } from "../providers/youtube";

function channelRef(company: AuditCompanyInput): string | null {
  return company.socials.youtube ?? null;
}

async function loadChannel(ctx: AuditContext, company: AuditCompanyInput, ref: string): Promise<YouTubeChannel | null> {
  const { getYouTubeChannel } = await import("../providers/youtube");
  const { withDomainCache } = await import("../agents/support");
  const { value } = await withDomainCache<YouTubeChannel | null>(
    ctx,
    `yt:${ref}`,
    "video.cadence",
    7 * 24 * 60 * 60,
    () => getYouTubeChannel(ref, 20),
  );
  return value;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

export const videoCadence: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.cadence";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found for the channel.");
  const now = ctx.clock.now();
  const cfg = await getAuditConfig();
  const dates = channel.videos.map((v) => new Date(v.publishedAt)).sort((x, y) => y.getTime() - x.getTime());
  const latest = dates[0];
  if (latest === undefined) return notAssessed(checkId, "No video dates available.");
  const sinceLatest = daysBetween(now, latest);
  const count = (days: number): number => dates.filter((d) => daysBetween(now, d) <= days).length;
  const gaps: number[] = [];
  for (let i = 0; i < dates.length - 1; i += 1) {
    const a = dates[i];
    const b = dates[i + 1];
    if (a !== undefined && b !== undefined) gaps.push(daysBetween(a, b));
  }
  const recentGap = gaps.slice(0, Math.ceil(gaps.length / 2));
  const olderGap = gaps.slice(Math.ceil(gaps.length / 2));
  const avg = (xs: number[]): number => (xs.length === 0 ? 0 : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length));
  const growing = avg(recentGap) > avg(olderGap);
  const goneQuiet = sinceLatest > cfg.videoGoneQuietDays && growing;
  const evidence = {
    counts: { last30: count(30), last90: count(90), last180: count(180) },
    metrics: { daysSinceLatest: sinceLatest, longestGapDays: gaps.length === 0 ? 0 : Math.max(...gaps) },
  };
  if (!goneQuiet) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "MEDIUM",
    claim: claim.videoCadence(sinceLatest, now),
    evidence,
    sourceUrl: channel.channelUrl,
    capturedAt: now.toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const videoCaptions: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.captions";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found.");
  const recent = channel.videos.slice(0, 20);
  const withCaptions = recent.filter((v) => v.caption).length;
  if (withCaptions / recent.length >= 0.5) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: claim.videoCaptions(withCaptions, recent.length, ctx.clock.now()),
    evidence: { counts: { withCaptions, total: recent.length } },
    sourceUrl: channel.channelUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 1,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const videoDurationProfile: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.duration_profile";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found.");
  const durations = channel.videos.map((v) => v.durationSeconds);
  const shorts = durations.filter((d) => d <= 60).length;
  const avg = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  const shortsShare = shorts / durations.length;
  if (shortsShare < 0.8) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: `Almost all of your recent videos are short-form (${String(shorts)} of ${String(durations.length)}), so you have little long-form content to build authority.`,
    evidence: { counts: { shorts, total: durations.length }, metrics: { averageSeconds: avg } },
    sourceUrl: channel.channelUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 0.9,
    pitchable: false,
  };
  return ok(checkId, [finding]);
};

export const videoEngagement: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.engagement";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found.");
  if (channel.subscriberCount === null || channel.subscriberCount < 100) {
    return notAssessed(checkId, "Subscriber count not available or too small to compare fairly.");
  }
  const avgViews = Math.round(channel.videos.reduce((s, v) => s + v.viewCount, 0) / channel.videos.length);
  const ratio = avgViews / channel.subscriberCount;
  if (ratio >= 0.1) return okEmpty(checkId);
  const finding: AuditFindingInput = {
    checkId,
    severity: "LOW",
    claim: claim.videoEngagement(avgViews, channel.subscriberCount, ctx.clock.now()),
    evidence: { metrics: { averageViews: avgViews, subscribers: channel.subscriberCount, viewsPerSubscriber: Number(ratio.toFixed(3)) } },
    sourceUrl: channel.channelUrl,
    capturedAt: ctx.clock.now().toISOString(),
    method: "MEASURED",
    confidence: 0.9,
    pitchable: true,
  };
  return ok(checkId, [finding]);
};

export const videoThumbnails: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.thumbnails";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found.");
  const thumbnails = channel.videos.slice(0, 12).map((v) => ({ videoId: v.id, url: v.thumbnailUrl }));
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-video-thumbnails",
    input: { serviceLine: ctx.lead.serviceLine, market: ctx.lead.market, thumbnails },
    allowedRefs: thumbnails.map((t) => t.url),
    estimatedCostMicros: COST_MICROS.aiVision,
    images: thumbnails.map((t) => ({ url: t.url, mediaType: "image/jpeg" as const })),
    build: (f) => {
      const sourceUrl = f.evidenceRefs.find((r) => thumbnails.some((t) => t.url === r));
      if (sourceUrl === undefined) return null;
      const pitchable = f.confidence >= 0.7 && (f.severity === "CRITICAL" || f.severity === "HIGH" || f.severity === "MEDIUM");
      const finding: AuditFindingInput = {
        checkId,
        severity: f.severity,
        claim: f.claim,
        evidence: { referenceIds: f.evidenceRefs },
        sourceUrl,
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

export const videoTitlesHooks: CheckFn = async (company, ctx) => {
  const checkId: AuditCheckId = "video.titles_hooks";
  const ref = channelRef(company);
  if (ref === null) return notApplicable(checkId, "No YouTube channel linked.");
  const channel = await loadChannel(ctx, company, ref);
  if (channel === null || channel.videos.length === 0) return notAssessed(checkId, "No public videos found.");
  const titles = channel.videos.slice(0, 20).map((v) => ({ videoId: v.id, title: v.title }));
  const result = await runAuditAiFindings(ctx, {
    task: "acquisition.audit-video-titles",
    input: { serviceLine: ctx.lead.serviceLine, market: ctx.lead.market, titles },
    allowedRefs: titles.map((t) => t.videoId),
    estimatedCostMicros: COST_MICROS.aiText,
    build: (f) => {
      const pitchable = f.confidence >= 0.7 && (f.severity === "CRITICAL" || f.severity === "HIGH" || f.severity === "MEDIUM");
      const finding: AuditFindingInput = {
        checkId,
        severity: f.severity,
        claim: f.claim,
        evidence: { referenceIds: f.evidenceRefs },
        sourceUrl: channel.channelUrl,
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

export const VIDEO_CHECK_FNS: Record<string, CheckFn> = {
  "video.cadence": videoCadence,
  "video.captions": videoCaptions,
  "video.duration_profile": videoDurationProfile,
  "video.engagement": videoEngagement,
  "video.thumbnails": videoThumbnails,
  "video.titles_hooks": videoTitlesHooks,
};
