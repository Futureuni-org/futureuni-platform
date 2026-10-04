import { CITATION_MARKER } from "@/contracts/ai-service";

/**
 * Client-side helpers for the draft editor: split a body into text and citation-marker tokens for
 * highlighting, strip markers for a clean preview, and run light per-channel length checks for live
 * feedback. The authoritative validation (banned phrases, links, citations) runs on the server when
 * the draft is edited or approved.
 */

export type DraftToken =
  | { type: "text"; value: string }
  | { type: "cite"; kind: "f" | "s"; id: string; index: number };

export function tokenizeBody(body: string): DraftToken[] {
  const tokens: DraftToken[] = [];
  const regex = new RegExp(CITATION_MARKER.source, "g");
  let last = 0;
  let citeIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (match.index > last) {
      tokens.push({ type: "text", value: body.slice(last, match.index) });
    }
    tokens.push({
      type: "cite",
      kind: match[1] === "s" ? "s" : "f",
      id: match[2] ?? "",
      index: ++citeIndex,
    });
    last = match.index + match[0].length;
  }
  if (last < body.length) tokens.push({ type: "text", value: body.slice(last) });
  return tokens;
}

export function stripMarkers(body: string): string {
  return body.replace(new RegExp(CITATION_MARKER.source, "g"), "").replace(/\s{2,}/g, " ").trim();
}

export function citedIdsInBody(body: string): string[] {
  const ids: string[] = [];
  for (const token of tokenizeBody(body)) {
    if (token.type === "cite" && token.kind === "f") ids.push(token.id);
  }
  return ids;
}

function wordCount(text: string): number {
  const trimmed = stripMarkers(text);
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export interface DraftLengthState {
  issues: string[];
  chars: number;
  words: number;
}

export function draftLengthState(
  channel: string,
  isFirstTouch: boolean,
  subject: string | null,
  body: string,
): DraftLengthState {
  const issues: string[] = [];
  const chars = stripMarkers(body).length;
  const words = wordCount(body);

  if (channel.startsWith("EMAIL")) {
    if (isFirstTouch) {
      if (subject === null || subject.trim().length === 0) issues.push("Add a subject.");
      else if (subject.length > 60) issues.push(`Subject is ${String(subject.length)}/60 characters.`);
      if (words > 120) issues.push(`Body is ${String(words)}/120 words.`);
    } else if (words > 90) {
      issues.push(`Follow-up body is ${String(words)}/90 words.`);
    }
  } else if (channel === "WHATSAPP_ASSISTED") {
    if (chars > 600) issues.push(`Message is ${String(chars)}/600 characters.`);
    if (!(body.split("\n")[0] ?? "").includes("FUTUREUNI")) {
      issues.push("The first line should name FUTUREUNI.");
    }
  } else if (channel === "LINKEDIN_ASSISTED") {
    if (chars > 300) issues.push(`Note is ${String(chars)}/300 characters.`);
  }
  return { issues, chars, words };
}

export function channelLabel(channel: string): string {
  switch (channel) {
    case "WHATSAPP_ASSISTED":
      return "WhatsApp";
    case "LINKEDIN_ASSISTED":
      return "LinkedIn";
    case "CALL_TASK":
      return "Call";
    default:
      return "Email";
  }
}
