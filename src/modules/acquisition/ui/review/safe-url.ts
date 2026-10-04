/**
 * Returns the URL only when it is http(s); otherwise null. Finding source URLs and artifact URLs
 * come from scraped/semi-trusted context, so this guards the render boundary against
 * `javascript:`/`data:` schemes (defence-in-depth stored-XSS protection).
 */
export function safeHttpUrl(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
