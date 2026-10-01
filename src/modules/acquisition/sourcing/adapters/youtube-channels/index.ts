import "server-only";

/**
 * YouTube Data API v3 adapter (Phase 8, Video Editing line). Finds channels by niche keywords and
 * emits `active_creator` (posting recently, in a target subscriber band) and `gone_quiet` (last
 * upload more than ~45 days ago).
 *
 * Quota (INV-14 / docs/integrations.md): `search.list` has its own 100-units/day bucket — that's
 * the cap that bites, so each `search.list` call charges `ctx.budget` and the per-day quota lives
 * in RunBudget. `channels.list` and `playlistItems.list` are 1 unit each of the separate 10k/day
 * bucket. Public YouTube data may be stored for at most 30 days before it's refreshed or deleted
 * (a refresh job, future), so we persist only derived facts and carry `observedAt`.
 */

import { z } from "zod";

import type { Market } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter, type EstimateContext, type InternalSourceAdapter } from "../types";
import { fetchJson } from "../_shared/provider-http";

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

const ParamsSchema = z.object({
  regionCode: z.string().length(2).optional(),
  maxResultsPerQuery: z.int().min(1).max(50).default(10),
  /** Subscriber band; defaults depend on the market (set in `search`). */
  minSubscribers: z.int().min(0).optional(),
  maxSubscribers: z.int().min(0).optional(),
  recentUploadDays: z.int().min(1).max(365).default(30),
  goneQuietDays: z.int().min(1).max(365).default(45),
});
type Params = z.infer<typeof ParamsSchema>;

const SUBSCRIBER_BANDS: Readonly<Record<Market, { min: number; max: number }>> = {
  NIGERIA: { min: 1_000, max: 200_000 },
  INTERNATIONAL: { min: 5_000, max: 500_000 },
};

interface SearchListResponse {
  items?: { id?: { channelId?: string } }[];
}
interface ChannelResource {
  id?: string;
  snippet?: { title?: string; publishedAt?: string };
  statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}
interface ChannelsListResponse {
  items?: ChannelResource[];
}
interface PlaylistItemsResponse {
  items?: { snippet?: { publishedAt?: string } }[];
}

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function daysBetween(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

function channelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

async function latestUploadAt(
  key: string,
  uploadsPlaylistId: string | undefined,
  ctx: SourceContext,
): Promise<string | null> {
  if (uploadsPlaylistId === undefined) return null;
  const url = `${PLAYLIST_ITEMS_URL}?part=snippet&maxResults=1&playlistId=${encodeURIComponent(uploadsPlaylistId)}&key=${encodeURIComponent(key)}`;
  const response = await fetchJson<PlaylistItemsResponse>(url, { signal: ctx.signal });
  if (!response.ok || response.data === null) return null;
  return response.data.items?.[0]?.snippet?.publishedAt ?? null;
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  const key = await ctx.resolveKey("youtube-data");
  if (key === null) {
    ctx.log.warn("youtube-channels has no API key; skipping");
    return;
  }
  const regionCode = params.regionCode ?? ctx.location.country ?? (ctx.market === "NIGERIA" ? "NG" : undefined);
  const band = {
    min: params.minSubscribers ?? SUBSCRIBER_BANDS[ctx.market].min,
    max: params.maxSubscribers ?? SUBSCRIBER_BANDS[ctx.market].max,
  };
  let emitted = 0;

  for (const keyword of ctx.keywords) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) return;

    const searchUrl =
      `${SEARCH_URL}?part=snippet&type=channel&maxResults=${String(params.maxResultsPerQuery)}` +
      `&q=${encodeURIComponent(keyword)}` +
      (regionCode === undefined ? "" : `&regionCode=${regionCode.toUpperCase()}`) +
      `&key=${encodeURIComponent(key)}`;
    const searchResponse = await fetchJson<SearchListResponse>(searchUrl, { signal: ctx.signal });
    if (!searchResponse.ok || searchResponse.data === null) {
      ctx.log.warn("youtube search.list failed", { keyword, status: searchResponse.status });
      if (searchResponse.exhausted) return;
      continue;
    }
    const channelIds = (searchResponse.data.items ?? [])
      .map((item) => item.id?.channelId)
      .filter((id): id is string => id !== undefined)
      .slice(0, 50);
    if (channelIds.length === 0) continue;

    const channelsUrl =
      `${CHANNELS_URL}?part=snippet,statistics,contentDetails&id=${channelIds.map(encodeURIComponent).join(",")}&key=${encodeURIComponent(key)}`;
    const channelsResponse = await fetchJson<ChannelsListResponse>(channelsUrl, { signal: ctx.signal });
    if (!channelsResponse.ok || channelsResponse.data === null) continue;

    for (const channel of channelsResponse.data.items ?? []) {
      if (emitted >= ctx.limit) return;
      const channelId = channel.id;
      if (channelId === undefined) continue;

      const subs = channel.statistics?.hiddenSubscriberCount === true
        ? null
        : toInt(channel.statistics?.subscriberCount);
      const lastUploadIso = await latestUploadAt(
        key,
        channel.contentDetails?.relatedPlaylists?.uploads,
        ctx,
      );
      const now = ctx.clock.now();
      const base = {
        adapterId: "youtube-channels" as const,
        companyName: channel.snippet?.title ?? `Channel ${channelId.slice(-6)}`,
        ...(regionCode === undefined ? {} : { country: regionCode.toUpperCase() }),
        sourceUrl: channelUrl(channelId),
        observedAt: now.toISOString(),
        externalRef: { adapterId: "youtube-channels" as const, externalId: channelId },
      };

      if (lastUploadIso !== null && daysBetween(lastUploadIso, now) > params.goneQuietDays) {
        const days = Math.round(daysBetween(lastUploadIso, now));
        yield {
          ...base,
          signalType: "gone_quiet",
          evidenceText: `The channel's latest upload was ${String(days)} days ago, longer than ${String(params.goneQuietDays)} days.`,
          evidence: { lastUploadAt: lastUploadIso, daysSinceUpload: days, subscribers: subs },
        };
        emitted += 1;
        continue;
      }

      const recent = lastUploadIso !== null && daysBetween(lastUploadIso, now) <= params.recentUploadDays;
      const inBand = subs !== null && subs >= band.min && subs <= band.max;
      if (recent && inBand) {
        yield {
          ...base,
          signalType: "active_creator",
          evidenceText: `Active creator: ${String(subs)} subscribers and an upload within the last ${String(params.recentUploadDays)} days.`,
          evidence: { subscribers: subs, lastUploadAt: lastUploadIso },
        };
        emitted += 1;
      }
    }
  }
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "youtube-channels",
  label: "YouTube channels",
  description: "Creators by niche and region: active-creator and gone-quiet signals for video editing.",
  markets: ["NIGERIA", "INTERNATIONAL"],
  supportedServiceLines: ["VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: (_params: Params, ctx: EstimateContext) => ctx.keywords.length,
  rateLimit: { perSecond: 2, perDay: 100 }, // the search.list bucket is the binding daily quota
  costPerCallMicros: 0, // free quota; quota pressure is modelled as the per-day call cap
  termsNotes:
    "YouTube public data may be stored at most 30 days then refreshed or deleted; search.list has its own 100/day quota; cache per query per day. We persist only derived facts.",
  docsUrl: "https://developers.google.com/youtube/v3/docs/search/list",
  termsUrl: "https://developers.google.com/youtube/terms/developer-policies",
  requiresCredential: "youtube-data",
  status: "ENABLED",
};

export default defineAdapter(adapter);
