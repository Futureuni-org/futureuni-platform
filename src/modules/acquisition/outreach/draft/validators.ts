/**
 * Draft validators run in code after generation (module spec §3.11; outreach-channel contract rule
 * 15). They enforce channel shape, link allow-listing, banned phrases and no fake "Re:"/"Fwd:".
 * Citation enforcement is separate (`assertClaimsCited`, applied in `draft.ts`).
 *
 * These functions are pure so they can be unit-tested without a database or model.
 */

import type { Channel } from "@/contracts/common";

/** Mirrors `runtime-skills/_shared/futureuni-voice/SKILL.md` plus the project-rules hype-word ban. */
export const BANNED_PHRASES: readonly string[] = [
  "in today's fast-paced world",
  "at the end of the day",
  "circle back",
  "reach out",
  "touch base",
  "moving forward",
  "leverage your",
  "level up",
  "world-class",
  "cutting-edge",
  "revolutionary",
  "game-changer",
  "seamless",
  "synergy",
  "solutions",
  "unlock the power of",
  "take you to the next level",
  "supercharge",
  "best-in-class",
  "skyrocket",
];

/** False-urgency markers that must never appear in first-touch outreach. */
const FALSE_URGENCY: readonly string[] = [
  "act now",
  "limited time",
  "limited-time",
  "last chance",
  "don't miss out",
  "hurry",
  "expires today",
  "only today",
];

export interface DraftShapeInput {
  channel: Channel;
  isFirstTouch: boolean;
  subject: string | null;
  body: string;
  /** Portfolio and booking URLs supplied to the draft; the only links allowed in the body. */
  allowedLinks: readonly string[];
}

export interface DraftValidation {
  ok: boolean;
  errors: string[];
}

const EMAIL_FIRST_TOUCH_SUBJECT_MAX = 60;
const EMAIL_FIRST_TOUCH_BODY_WORDS = 120;
const EMAIL_FOLLOW_UP_BODY_WORDS = 90;
const WHATSAPP_MAX_CHARS = 600;
const LINKEDIN_MAX_CHARS = 300;

const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/gi;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, ""));
}

/** Normalises a URL for allow-list comparison (drops a trailing slash and the scheme case). */
function normaliseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function validateDraftShape(input: DraftShapeInput): DraftValidation {
  const errors: string[] = [];
  const body = input.body;
  const lower = body.toLowerCase();
  const subject = input.subject ?? "";

  // Links: every URL in the body must be one of the allowed links.
  const allowed = new Set(input.allowedLinks.map(normaliseUrl));
  const urls = extractUrls(body);
  for (const url of urls) {
    if (!allowed.has(normaliseUrl(url))) errors.push(`Link not allowed: ${url}`);
  }

  // Banned phrases and false urgency.
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) errors.push(`Banned phrase: "${phrase}"`);
  }
  if (input.isFirstTouch) {
    for (const phrase of FALSE_URGENCY) {
      if (lower.includes(phrase)) errors.push(`False urgency: "${phrase}"`);
    }
  }

  // Channel shape.
  switch (input.channel) {
    case "EMAIL": {
      if (input.isFirstTouch) {
        if (subject.trim() === "") errors.push("A first-touch email needs a subject.");
        if (subject.length > EMAIL_FIRST_TOUCH_SUBJECT_MAX)
          errors.push(`Subject over ${String(EMAIL_FIRST_TOUCH_SUBJECT_MAX)} characters.`);
        if (wordCount(body) > EMAIL_FIRST_TOUCH_BODY_WORDS)
          errors.push(`First-touch body over ${String(EMAIL_FIRST_TOUCH_BODY_WORDS)} words.`);
        if (body.includes("!")) errors.push("No exclamation marks in first-touch outreach.");
      } else if (wordCount(body) > EMAIL_FOLLOW_UP_BODY_WORDS) {
        errors.push(`Follow-up body over ${String(EMAIL_FOLLOW_UP_BODY_WORDS)} words.`);
      }
      if (/^\s*(re|fwd?):/i.test(subject)) errors.push('No fake "Re:" or "Fwd:" subject.');
      break;
    }
    case "WHATSAPP_ASSISTED": {
      if (body.length > WHATSAPP_MAX_CHARS)
        errors.push(`WhatsApp message over ${String(WHATSAPP_MAX_CHARS)} characters.`);
      const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
      if (!firstLine.toUpperCase().includes("FUTUREUNI"))
        errors.push("The first WhatsApp line must identify FUTUREUNI.");
      if (urls.length > 1) errors.push("WhatsApp allows at most one link.");
      break;
    }
    case "LINKEDIN_ASSISTED": {
      if (body.length > LINKEDIN_MAX_CHARS)
        errors.push(`LinkedIn note over ${String(LINKEDIN_MAX_CHARS)} characters.`);
      break;
    }
    case "CALL_TASK":
      break;
  }

  return { ok: errors.length === 0, errors };
}
