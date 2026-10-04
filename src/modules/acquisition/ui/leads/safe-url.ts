/**
 * Makes a stored URL safe to put in an `href`. Websites, source links and profile links come from
 * scraped pages, provider payloads and CSV imports, and are stored as plain text, so they are
 * untrusted: this accepts only `http:` and `https:` and returns `null` for anything else (a
 * `javascript:` URL, a malformed value). A bare domain such as "acme.com" is given `https://`, so
 * it links to the site instead of resolving as a path inside this app.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const raw = value.trim();
  if (raw === "") return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
