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

// ---------------------------------------------------------------------------
// Log redaction (Phase 20, SEC-5): a stronger pass for the structured logger.
// ---------------------------------------------------------------------------

/** Keys that hold personal data and are redacted whole (beyond the secret keys above). */
const PII_KEYS = [
  "email",
  "phone",
  "whatsapp",
  "linkedin",
  "body",
  "subject",
  "transcript",
  "firstname",
  "lastname",
  "fullname",
  "contactname",
  "address",
];

// Value-level masks: an email anywhere, and an E.164 phone (requires a leading "+", so money minor
// units and cuids are never mistaken for phone numbers).
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+\d[\d\s().-]{7,}\d/g;

function maskString(value: string): string {
  return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[phone]");
}

/**
 * Redact a value for logging: the secret keys and PII keys are dropped whole, and any email or
 * E.164 phone that appears inside a string value is masked. Used by the structured job logger so a
 * caller that accidentally passes personal data never writes it to the logs (INV-13, logging rules).
 */
export function redactLogData<T>(value: T): T {
  return redactLogUnknown(value) as T;
}

function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return isSensitive(key) || PII_KEYS.some((needle) => lower.includes(needle));
}

function redactLogUnknown(value: unknown, depth = 0): unknown {
  if (depth > 32) return "[TOO_DEEP]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.map((item) => redactLogUnknown(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isPiiKey(key) ? REDACTED : redactLogUnknown(inner, depth + 1);
    }
    return out;
  }
  return value;
}
