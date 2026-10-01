/**
 * Deterministic YouTube mock. A ref containing "quiet" produces a channel that went quiet (last
 * upload months ago, growing gap); "active" produces a healthy cadence. Otherwise a middling mix.
 */

import "server-only";

import type { YouTubeChannel, YouTubeVideo } from "./index";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function mockYouTubeChannel(ref: string, maxVideos: number): YouTubeChannel {
  const h = hash(ref);
  const quiet = ref.includes("quiet");
  const active = ref.includes("active");
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Gap between uploads: active ~ 7 days, quiet ~ widening, default ~ 21 days.
  const videos: YouTubeVideo[] = [];
  let cursor = quiet ? now - 60 * dayMs : now - 3 * dayMs;
  for (let i = 0; i < maxVideos; i += 1) {
    // Quiet: the most recent gaps are large and older gaps small, so the channel is slowing down.
    const gap = active ? 7 : quiet ? Math.max(5, 50 - i * 4) : 18 + ((h + i) % 10);
    const isShort = (h + i) % 3 === 0;
    videos.push({
      id: `vid_${ref.slice(0, 6)}_${String(i)}`,
      publishedAt: new Date(cursor).toISOString(),
      durationSeconds: isShort ? 45 : 300 + ((h + i * 37) % 900),
      caption: (h + i) % 2 === 0,
      viewCount: 200 + ((h + i * 991) % 20_000),
      title: `${active ? "How to" : "Update"} ${String(i + 1)}: ${ref.split("/").pop() ?? "video"}`,
      thumbnailUrl: `https://i.ytimg.com/vi/vid_${ref.slice(0, 6)}_${String(i)}/hqdefault.jpg`,
    });
    cursor -= gap * dayMs;
  }

  return {
    channelId: `UC${(h % 1_000_000).toString(36)}`,
    channelUrl: ref.startsWith("http") ? ref : `https://www.youtube.com/${ref}`,
    title: "Example Channel",
    subscriberCount: 500 + (h % 50_000),
    videos,
  };
}
