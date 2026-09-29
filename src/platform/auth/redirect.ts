/**
 * Same-origin `next=` redirect helper (docs/specs/platform.md §7): only a relative same-origin
 * path is allowed. Anything else (a scheme, `//host`, backslashes, whitespace, control
 * characters) falls back to `/`, so no external URL can be smuggled through the login form.
 */

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeNext(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined) return "/";
  const value = candidate.trim();
  if (value === "" || value === "/") return "/";
  // Reject anything that isn't a plain relative same-origin path.
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.includes("\\")) return "/";
  if (hasControlChar(value)) return "/";
  // Never accept auth URLs as the "come back here after signing in" target.
  if (
    value.startsWith("/login") ||
    value.startsWith("/reset") ||
    value.startsWith("/invite") ||
    value.startsWith("/setup-2fa") ||
    value.startsWith("/signed-out")
  ) {
    return "/";
  }
  return value;
}
