import "server-only";

/**
 * Evidence citation enforcement (INV-5): every personalised claim about a prospect in an
 * AI-drafted output must reference a stored AuditFinding or Signal id. Markers look like
 * `[[f:<findingId>]]` or `[[s:<signalId>]]`, where the id is 20–32 lower-case alphanumerics.
 *
 * `assertClaimsCited` fails when a marker names an id not in the allowed set, or when
 * `requireAtLeastOne` is set and the text carries no marker at all. Callers pass the exact
 * evidence ids they supplied in the prompt input.
 *
 * `stripCitationMarkers` removes markers for rendering or sending: it is the ONLY function
 * that strips them, and it never fires until the assertion has passed.
 */

import {
  CITATION_MARKER,
  type AssertClaimsCited,
  type StripCitationMarkers,
} from "@/contracts/ai-service";

import { citationInvalid } from "./errors";

function extractMarkers(text: string): { kind: "f" | "s"; id: string }[] {
  const out: { kind: "f" | "s"; id: string }[] = [];
  // Fresh regex each call — the exported one has the /g flag and shared state.
  const re = new RegExp(CITATION_MARKER.source, "g");
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const kind = m[1] as "f" | "s";
    const id = m[2];
    if (id !== undefined) out.push({ kind, id });
    m = re.exec(text);
  }
  return out;
}

export const assertClaimsCited: AssertClaimsCited = (text, allowedEvidenceIds, opts) => {
  const texts = Array.isArray(text) ? text : [text];
  const allowed = new Set(allowedEvidenceIds);
  const unknownIds = new Set<string>();
  let totalMarkers = 0;

  for (const t of texts) {
    const markers = extractMarkers(t);
    totalMarkers += markers.length;
    for (const marker of markers) {
      if (!allowed.has(marker.id)) unknownIds.add(marker.id);
    }
  }

  if (unknownIds.size > 0) {
    throw citationInvalid({ unknownIds: Array.from(unknownIds) });
  }
  if (opts?.requireAtLeastOne && totalMarkers === 0) {
    throw citationInvalid({ reason: "no citation markers", requireAtLeastOne: true });
  }
};

export const stripCitationMarkers: StripCitationMarkers = (text) =>
  text.replace(new RegExp(CITATION_MARKER.source, "g"), "").replace(/[ \t]{2,}/g, " ");
