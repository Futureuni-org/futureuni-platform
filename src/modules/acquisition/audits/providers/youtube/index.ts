/**
 * YouTube Data API v3 provider (provider id `youtube-data`). Returns recent uploads for a channel
 * with the fields the video audit needs. `mock` under `MOCKS=true`; the real adapter uses
 * channels.list → playlistItems.list → videos.list (1 unit each; `search.list` is avoided to stay
 * off its separate 100/day quota).
 *
 * Public, non-authorised data may be stored for at most 30 days (YouTube API terms); audit evidence
 * carries `capturedAt`. Docs: https://developers.google.com/youtube/v3/docs/videos/list
 */

import "server-only";

import { env } from "@/env";

export interface YouTubeVideo {
  id: string;
  publishedAt: string; // ISO
  durationSeconds: number;
  caption: boolean; // contentDetails.caption === "true"
  viewCount: number;
  title: string;
  thumbnailUrl: string;
}

export interface YouTubeChannel {
  channelId: string;
  channelUrl: string;
  title: string;
  subscriberCount: number | null;
  videos: YouTubeVideo[]; // newest first
}

/** `ref` may be a channel URL, an @handle, or a bare channel id. Returns null when none resolves. */
export async function getYouTubeChannel(ref: string, maxVideos = 20): Promise<YouTubeChannel | null> {
  if (env.MOCKS) {
    const { mockYouTubeChannel } = await import("./mock");
    return mockYouTubeChannel(ref, maxVideos);
  }
  const { realYouTubeChannel } = await import("./real");
  return realYouTubeChannel(ref, maxVideos);
}
