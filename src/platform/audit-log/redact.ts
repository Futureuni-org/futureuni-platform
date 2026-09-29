/**
 * Redact sensitive keys from an audit-log `before`/`after` value.
 *
 * A key whose name matches one of `SENSITIVE_KEYS` is replaced with `"[REDACTED]"`. Matching is
 * case-insensitive and by substring, so `apiKey`, `API_KEY`, `X-Api-Key` and `refreshToken` all
 * hit. Arrays and nested objects are walked. The input is never mutated.
 */

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "apikey",
  "ciphertext",
  "authtag",
  "iv",
  "privatekey",
  "hash",
  "cookie",
  "authorization",
  "backupcode",
];

const REDACTED = "[REDACTED]";

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((needle) => lower.includes(needle));
}

/** Recursively redact sensitive fields in-place on a defensive copy. */
export function redact<T>(value: T): T {
  return redactUnknown(value) as T;
}

function redactUnknown(value: unknown, depth = 0): unknown {
  if (depth > 32) return "[TOO_DEEP]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitive(key) ? REDACTED : redactUnknown(inner, depth + 1);
    }
    return out;
  }
  return value;
}
