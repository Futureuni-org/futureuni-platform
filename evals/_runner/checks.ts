import type { CheckResult, EvalCase } from "./types";

/** Push a check, only including `message` when present. */
function pushCheck(
  target: CheckResult[],
  name: string,
  pass: boolean,
  message?: string,
): void {
  target.push(message === undefined ? { name, pass } : { name, pass, message });
}

/** Basic exact-match / contains / must-not-contain checks. */
export function runBasicChecks(caseData: EvalCase, output: unknown): CheckResult[] {
  const checks: CheckResult[] = [];
  const outputText = JSON.stringify(output);
  const e = caseData.expectations;

  if (e.schemaValid !== false) {
    pushCheck(checks, "schemaValid", true);
  }

  for (const phrase of e.mustMention ?? []) {
    const hit = outputText.includes(phrase);
    pushCheck(checks, `mustMention:${phrase}`, hit, hit ? undefined : `missing "${phrase}"`);
  }
  for (const phrase of e.mustNotMention ?? []) {
    const hit = outputText.includes(phrase);
    pushCheck(checks, `mustNotMention:${phrase}`, !hit, hit ? `found "${phrase}"` : undefined);
  }
  for (const phrase of e.bannedPhrases ?? []) {
    const hit = outputText.toLowerCase().includes(phrase.toLowerCase());
    pushCheck(
      checks,
      `bannedPhrases:${phrase}`,
      !hit,
      hit ? `banned phrase "${phrase}"` : undefined,
    );
  }
  for (const [key, want] of Object.entries(e.exactMatch ?? {})) {
    const actual = readPath(output, key);
    const eq = JSON.stringify(actual) === JSON.stringify(want);
    pushCheck(
      checks,
      `exactMatch:${key}`,
      eq,
      eq ? undefined : `expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`,
    );
  }
  if (e.citedEvidenceIds !== undefined) {
    const outputAsObj = output as { citedEvidenceIds?: string[] };
    const actual = new Set(outputAsObj.citedEvidenceIds ?? []);
    const expected = new Set(e.citedEvidenceIds);
    const missing = [...expected].filter((id) => !actual.has(id));
    pushCheck(
      checks,
      "citedEvidenceIds",
      missing.length === 0,
      missing.length === 0 ? undefined : `missing ids: ${missing.join(",")}`,
    );
  }
  return checks;
}

function readPath(obj: unknown, path: string): unknown {
  let cursor: unknown = obj;
  for (const key of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}
