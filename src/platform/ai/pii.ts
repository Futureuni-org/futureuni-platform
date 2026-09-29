import "server-only";

/**
 * INV-13: strip input fields not on the task's piiPolicy.allowedPersonalFields allowlist
 * before the input is hashed for logging, sent to the model or stored in AiCall.
 *
 * `allowedPersonalFields` is a list of dotted paths — "contact.email" keeps that leaf even
 * if any other "email" fields on the input are removed. A path may end with "[]" to mean
 * "the same relative path inside every array item" (e.g. "contacts[].email").
 *
 * The stripped input is a structurally-fresh deep clone; the original is never mutated.
 */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Marker for the "any array element" segment when parsing a dotted allow-path. */
const ARRAY_SEG = "[]";
type Segment = string;

/** Personal-data field names removed from any nested object that is not explicitly kept. */
const PERSONAL_FIELDS = new Set([
  "email",
  "phone",
  "phoneNumber",
  "personalEmail",
  "mobile",
  "whatsapp",
  "linkedIn",
  "linkedin",
  "firstName",
  "lastName",
  "fullName",
]);

interface AllowSpec {
  segments: readonly Segment[];
}

function parsePath(path: string): AllowSpec {
  return {
    segments: path
      .split(".")
      .flatMap((s) => (s.endsWith("[]") ? [s.slice(0, -2), ARRAY_SEG] : [s])),
  };
}

/** True when this exact object-field-name key at this cursor path is on the allowlist. */
function isAllowed(cursor: readonly Segment[], key: string, allow: readonly AllowSpec[]): boolean {
  return allow.some((spec) => {
    if (spec.segments.length !== cursor.length + 1) return false;
    for (let i = 0; i < cursor.length; i++) {
      if (spec.segments[i] !== cursor[i]) return false;
    }
    return spec.segments[cursor.length] === key;
  });
}

function stripValue(
  value: Json,
  cursor: readonly Segment[],
  allow: readonly AllowSpec[],
): Json {
  if (Array.isArray(value)) {
    return value.map((item) => stripValue(item, [...cursor, ARRAY_SEG], allow));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PERSONAL_FIELDS.has(k) && !isAllowed(cursor, k, allow)) continue;
      out[k] = stripValue(v, [...cursor, k], allow);
    }
    return out;
  }
  return value;
}

export interface PiiPolicy {
  allowedPersonalFields: readonly string[];
}

/** Returns a deep-cloned copy of input with disallowed personal fields removed. */
export function applyPiiPolicy<T>(input: T, policy: PiiPolicy): T {
  const allow = policy.allowedPersonalFields.map(parsePath);
  return stripValue(input as Json, [], allow) as T;
}
