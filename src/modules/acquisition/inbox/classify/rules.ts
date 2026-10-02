/**
 * Stage 1 classification: deterministic rules that run before the model (module spec §3.12).
 *
 * - A delivery status notification (RFC 3464: `multipart/report; report-type=delivery-status`, or a
 *   mailer-daemon/postmaster sender) is BOUNCE; the failed recipient and 5.x.x (hard) vs 4.x.x
 *   (soft) status are parsed from the report.
 * - An `Auto-Submitted: auto-replied|auto-generated` header (RFC 3834), `X-Autoreply`, a bulk/junk
 *   `Precedence`, or a common out-of-office subject is OUT_OF_OFFICE, with the return date if present.
 * - Clear stop-contact language is UNSUBSCRIBE.
 *
 * Sources verified 2026-10-01: RFC 3834 (Auto-Submitted), RFC 3464 (DSN format),
 * https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list.
 */

export interface ReplySignals {
  headers: Record<string, string>;
  fromAddress: string;
  subject: string;
}

export type DeterministicClass = "BOUNCE" | "OUT_OF_OFFICE" | "UNSUBSCRIBE";

export interface DeterministicResult {
  classification: DeterministicClass;
  bounce?: { email: string; kind: "HARD" | "SOFT" };
  returnDateText?: string | null;
}

function headerValue(sig: ReplySignals, key: string): string | null {
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(sig.headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

const MAILER_DAEMON = /(mailer-daemon|postmaster|no-?reply@.*(bounce|mail))/i;
const DSN_CONTENT_TYPE = /multipart\/report.*report-type\s*=\s*"?delivery-status/i;

/** Detects a bounce (DSN). Returns the failed recipient and hard/soft kind, or null. */
export function detectBounce(sig: ReplySignals, fallbackRecipient: string | null, body: string): { email: string; kind: "HARD" | "SOFT" } | null {
  const contentType = headerValue(sig, "Content-Type") ?? "";
  const isDsn = DSN_CONTENT_TYPE.test(contentType) || MAILER_DAEMON.test(sig.fromAddress);
  if (!isDsn) return null;

  const statusMatch = /(?:^|\n)\s*Status\s*:\s*([245])\.\d{1,3}\.\d{1,3}/i.exec(body);
  const actionMatch = /(?:^|\n)\s*Action\s*:\s*(failed|delayed|delivered|relayed|expanded)/i.exec(body);
  const statusClass = statusMatch?.[1] ?? null;
  const action = actionMatch?.[1]?.toLowerCase() ?? null;

  let kind: "HARD" | "SOFT" = "HARD";
  if (statusClass === "4" || action === "delayed") kind = "SOFT";
  else if (statusClass === "5" || action === "failed") kind = "HARD";

  const failed = extractFailedRecipient(body) ?? fallbackRecipient;
  if (failed === null) return null;
  return { email: failed, kind };
}

function extractFailedRecipient(body: string): string | null {
  const finalRcpt = /(?:^|\n)\s*(?:Final|Original)-Recipient\s*:\s*[^;]+;\s*([^\s>]+@[^\s>]+)/i.exec(body);
  if (finalRcpt?.[1] !== undefined) return finalRcpt[1].replace(/[<>]/g, "").toLowerCase();
  const inline = /(?:failed|undeliverable|not\s+be\s+delivered|rejected)[\s\S]{0,120}?<?([^\s<>]+@[^\s<>]+)>?/i.exec(body);
  return inline?.[1]?.toLowerCase() ?? null;
}

const OOO_SUBJECTS = [
  /out of (the )?office/i,
  /auto(?:matic)?[\s-]?reply/i,
  /automatic response/i,
  /away from (my )?(desk|office|email)/i,
  /on (annual )?leave/i,
  /on (holiday|vacation)/i,
  /maternity leave/i,
  /currently (away|unavailable)/i,
];

/** Detects an auto-reply / out-of-office. Returns any return-date text it can see, or null. */
export function detectOutOfOffice(sig: ReplySignals, body: string): { returnDateText: string | null } | null {
  const autoSubmitted = (headerValue(sig, "Auto-Submitted") ?? "").toLowerCase();
  const xAutoreply = headerValue(sig, "X-Autoreply");
  const xSuppress = headerValue(sig, "X-Auto-Response-Suppress");
  const precedence = (headerValue(sig, "Precedence") ?? "").toLowerCase();

  const headerSays =
    autoSubmitted === "auto-replied" ||
    autoSubmitted === "auto-generated" ||
    (xAutoreply !== null && xAutoreply !== "") ||
    (xSuppress !== null && xSuppress !== "") ||
    precedence === "bulk" ||
    precedence === "junk" ||
    precedence === "auto_reply";

  const subjectSays = OOO_SUBJECTS.some((re) => re.test(sig.subject));
  if (!headerSays && !subjectSays) return null;

  const returnMatch =
    /(?:back|return(?:ing)?|returning on|available again|back in the office)\s+(?:on|from)?\s*([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)/i.exec(
      body,
    ) ?? /(?:until|till)\s+([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)/i.exec(body);
  return { returnDateText: returnMatch?.[1] ?? null };
}

const STOP_LANGUAGE = [
  /\bunsubscrib/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\bstop (emailing|contacting|messaging|sending)/i,
  /\bdo not (contact|email|message)\b/i,
  /\bdon'?t (contact|email) me\b/i,
  /\bopt[\s-]?out\b/i,
  /\bno longer (wish|want) to (receive|be contacted)/i,
];

/** Detects clear stop-contact language anywhere in the reply text. */
export function detectUnsubscribe(text: string): boolean {
  return STOP_LANGUAGE.some((re) => re.test(text));
}

/** Runs the deterministic rules in order. Returns the first match, or null to defer to the model. */
export function classifyDeterministic(
  sig: ReplySignals,
  fallbackRecipient: string | null,
  latestText: string,
  fullText: string,
): DeterministicResult | null {
  const bounce = detectBounce(sig, fallbackRecipient, fullText);
  if (bounce !== null) return { classification: "BOUNCE", bounce };

  const ooo = detectOutOfOffice(sig, fullText);
  if (ooo !== null) return { classification: "OUT_OF_OFFICE", returnDateText: ooo.returnDateText };

  if (detectUnsubscribe(latestText)) return { classification: "UNSUBSCRIBE" };

  return null;
}
