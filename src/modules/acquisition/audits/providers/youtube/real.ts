/**
 * Real YouTube Data API v3 calls: resolve the channel, read its uploads playlist, then fetch video
 * details. Uses only list endpoints (1 unit each), never `search.list`.
 */

import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { resolveProviderKey } from "@/platform/credentials";

import type { YouTubeChannel, YouTubeVideo } from "./index";

const API = "https://www.googleapis.com/youtube/v3";
const TIMEOUT_MS = 20_000;

const ChannelsResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string() }).optional(),
        contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string() }) }),
        statistics: z.object({ subscriberCount: z.string().optional() }).optional(),
      }),
    )
    .default([]),
});
const PlaylistItemsResponse = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string() }) })).default([]),
});
const VideosResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({
          title: z.string(),
          publishedAt: z.string(),
          thumbnails: z.record(z.string(), z.object({ url: z.string() })).optional(),
        }),
        contentDetails: z.object({ duration: z.string(), caption: z.string().optional() }),
        statistics: z.object({ viewCount: z.string().optional() }).optional(),
      }),
    )
    .default([]),
});

async function call<T>(path: string, params: Record<string, string>, key: string, schema: z.ZodType<T>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `YouTube ${path} returned ${String(res.status)}.`);
    return schema.parse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

function channelSelector(ref: string): { param: "id" | "forHandle" | "forUsername"; value: string } {
  const channelMatch = /\/channel\/(UC[\w-]+)/.exec(ref);
  if (channelMatch?.[1] !== undefined) return { param: "id", value: channelMatch[1] };
  if (ref.startsWith("UC")) return { param: "id", value: ref };
  const handleMatch = /@([\w.-]+)/.exec(ref);
  if (handleMatch?.[1] !== undefined) return { param: "forHandle", value: `@${handleMatch[1]}` };
  const userMatch = /\/user\/([\w-]+)/.exec(ref);
  if (userMatch?.[1] !== undefined) return { param: "forUsername", value: userMatch[1] };
  return { param: "forHandle", value: ref.startsWith("@") ? ref : `@${ref}` };
}

/** Parses an ISO 8601 duration (PT#H#M#S) to seconds. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (m === null) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export async function realYouTubeChannel(ref: string, maxVideos: number): Promise<YouTubeChannel | null> {
  const key = await resolveProviderKey("youtube-data");
  if (key === null) throw new AppError("PROVIDER_ERROR", "No YouTube Data API key configured.");

  const sel = channelSelector(ref);
  const channels = await call(
    "channels",
    { part: "snippet,contentDetails,statistics", [sel.param]: sel.value },
    key,
    ChannelsResponse,
  );
  const channel = channels.items[0];
  if (channel === undefined) return null;

  const uploads = channel.contentDetails.relatedPlaylists.uploads;
  const playlist = await call(
    "playlistItems",
    { part: "contentDetails", playlistId: uploads, maxResults: String(Math.min(maxVideos, 50)) },
    key,
    PlaylistItemsResponse,
  );
  const videoIds = playlist.items.map((i) => i.contentDetails.videoId).slice(0, maxVideos);
  if (videoIds.length === 0) {
    return { channelId: channel.id, channelUrl: `https://www.youtube.com/channel/${channel.id}`, title: channel.snippet?.title ?? "", subscriberCount: toNum(channel.statistics?.subscriberCount), videos: [] };
  }

  const videos = await call(
    "videos",
    { part: "snippet,contentDetails,statistics", id: videoIds.join(",") },
    key,
    VideosResponse,
  );
  const mapped: YouTubeVideo[] = videos.items.map((v) => ({
    id: v.id,
    publishedAt: v.snippet.publishedAt,
    durationSeconds: parseIsoDuration(v.contentDetails.duration),
    caption: v.contentDetails.caption === "true",
    viewCount: toNum(v.statistics?.viewCount) ?? 0,
    title: v.snippet.title,
    thumbnailUrl:
      v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url ?? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  }));
  mapped.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  return {
    channelId: channel.id,
    channelUrl: `https://www.youtube.com/channel/${channel.id}`,
    title: channel.snippet?.title ?? "",
    subscriberCount: toNum(channel.statistics?.subscriberCount),
    videos: mapped,
  };
}

function toNum(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
