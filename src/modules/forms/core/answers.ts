/**
 * Answer handling: pure, no database, no session — so the public renderer and the submit action
 * apply exactly the same rules (docs/specs/module-forms.md §7).
 *
 * Everything here is defensive about the input, because in the public form the input comes from a
 * browser we do not control: unknown keys are dropped, choice values must be ones the definition
 * declares, and every text answer is trimmed and capped.
 */

import {
  FORM_LIMITS,
  isBlankAnswer,
  type FormAnswer,
  type FormAnswers,
  type FormDefinition,
  type FormField,
} from "@/contracts/forms";

/** Every question in the form, flattened. */
export function questionCount(definition: FormDefinition): number {
  return definition.sections.reduce((total, section) => total + section.fields.length, 0);
}

/** How many questions carry an answer the team can read. */
export function answeredCount(definition: FormDefinition, answers: FormAnswers): number {
  let answered = 0;
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (!isBlankAnswer(answers[field.key])) answered += 1;
    }
  }
  return answered;
}

/**
 * Keeps only what the definition asks for: known keys, declared choice values, trimmed and capped
 * text. A field whose answer ends up blank is left out entirely, so "not answered" is one state
 * rather than three.
 */
export function normalizeAnswers(definition: FormDefinition, raw: unknown): FormAnswers {
  const input: Record<string, unknown> =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const clean: Record<string, FormAnswer> = {};

  for (const section of definition.sections) {
    for (const field of section.fields) {
      const value = normalizeField(field, input[field.key]);
      if (value !== undefined) clean[field.key] = value;
    }
  }
  return clean;
}

function normalizeField(field: FormField, value: unknown): FormAnswer | undefined {
  if (field.kind === "multiChoice") {
    if (!Array.isArray(value)) return undefined;
    const allowed = new Set((field.choices ?? []).map((choice) => choice.value));
    const chosen = value
      .filter((item): item is string => typeof item === "string")
      .filter((item) => allowed.has(item))
      .slice(0, FORM_LIMITS.selections);
    return chosen.length === 0 ? undefined : [...new Set(chosen)];
  }

  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, FORM_LIMITS.answerChars);
  if (text === "") return undefined;

  if (field.kind === "singleChoice") {
    const allowed = new Set((field.choices ?? []).map((choice) => choice.value));
    return allowed.has(text) ? text : undefined;
  }
  return text;
}

/** The required questions the prospect has not answered, in the order they appear. */
export function missingRequired(
  definition: FormDefinition,
  answers: FormAnswers,
): readonly FormField[] {
  const missing: FormField[] = [];
  for (const section of definition.sections) {
    for (const field of section.fields) {
      if (field.required === true && isBlankAnswer(answers[field.key])) missing.push(field);
    }
  }
  return missing;
}

/** A single answer as one line of text ("a, b, c" for a multi-choice). */
export function answerToText(answer: FormAnswer | undefined): string {
  if (answer === undefined) return "";
  return typeof answer === "string" ? answer : answer.join(", ");
}

/**
 * The serialised size of the answers, so the submit action can refuse an oversized payload.
 * `TextEncoder`, not `Buffer`: this file is imported by the public renderer too.
 */
export function answersByteLength(answers: FormAnswers): number {
  return new TextEncoder().encode(JSON.stringify(answers)).byteLength;
}
