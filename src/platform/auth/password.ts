/**
 * Password policy (docs/specs/platform.md §7):
 *   - minimum 12 characters
 *   - rejected against a small, curated list of common passwords
 *   - a lightweight strength score for the meter on the client
 *
 * Better Auth's default hasher (scrypt) does the hashing.
 */

const MIN_LENGTH = 12;

// Small hand-picked list of very common passwords and phrases. Not exhaustive: this is a
// defence-in-depth measure, not the whole check.
const COMMON_PASSWORDS = new Set(
  [
    "password",
    "password1",
    "password12",
    "password123",
    "password1234",
    "password12345",
    "password123456",
    "passw0rd12",
    "passw0rd123",
    "passw0rd1234",
    "12345678",
    "123456789",
    "1234567890",
    "qwertyuiop",
    "qwerty12345",
    "letmein12345",
    "iloveyou12345",
    "welcome12345",
    "monkey12345",
    "adminadmin1",
    "administrator",
    "abcdef123456",
    "trustno1abc",
    "changeme1234",
    "changeme123!",
    "correcthorse",
    "correcthorsebatterystaple",
    "futureuni2026",
    "futureuni1234",
  ].map((value) => value.toLowerCase()),
);

export interface PasswordCheck {
  ok: boolean;
  reason?: "TOO_SHORT" | "COMMON";
  score: 0 | 1 | 2 | 3 | 4; // 0 = terrible, 4 = strong
  label: "too short" | "weak" | "fair" | "good" | "strong";
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;

export function checkPassword(candidate: string): PasswordCheck {
  const password = candidate.trim();
  if (password.length < MIN_LENGTH) {
    return { ok: false, reason: "TOO_SHORT", score: 0, label: "too short" };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "COMMON", score: 1, label: "weak" };
  }
  const score = strengthScore(password);
  const label = score >= 4 ? "strong" : score === 3 ? "good" : score === 2 ? "fair" : "weak";
  return { ok: score >= 2, score, label };
}

function strengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  // Character-class diversity + length. Deliberately simple, and client-safe.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce(
    (count, regex) => count + (regex.test(password) ? 1 : 0),
    0,
  );
  const length = password.length;
  let raw = 0;
  if (length >= MIN_LENGTH && classes >= 1) raw = 1;
  if (length >= MIN_LENGTH && classes >= 2) raw = 2;
  if (length >= 14 && classes >= 3) raw = 3;
  if (length >= 16 && classes >= 3) raw = 4;
  if (length >= 20 && classes >= 2) raw = Math.max(raw, 3);
  return raw as 0 | 1 | 2 | 3 | 4;
}
