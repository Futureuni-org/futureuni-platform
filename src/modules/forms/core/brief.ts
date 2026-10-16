/**
 * Renders a submission as the plain-text brief (docs/specs/module-forms.md §6).
 *
 * One function, two readers: the prospect copies it from the public page as their own record, and
 * the team copies it from `/forms/<slug>/<id>` into a proposal or a chat. Pure — no database, no
 * session — so both sides produce byte-identical text.
 */

import { type FormAnswers, type FormDefinition, type FormField } from "@/contracts/forms";

import { answerToText } from "./answers";

const NOT_ANSWERED = "Not answered";

export interface BriefOptions {
  /** Shown under the title, e.g. the submission time. */
  subtitle?: string;
  /**
   * Include questions the prospect left blank, marked "Not answered". The team wants to see the
   * gaps; the prospect's own copy reads better without them.
   */
  includeUnanswered?: boolean;
}

function label(field: FormField): string {
  return field.briefLabel ?? field.label;
}

export function renderBrief(
  definition: FormDefinition,
  answers: FormAnswers,
  options: BriefOptions = {},
): string {
  const lines: string[] = [definition.title.toUpperCase(), ""];
  if (options.subtitle !== undefined && options.subtitle !== "") {
    lines.push(options.subtitle, "");
  }

  for (const section of definition.sections) {
    const rows: string[] = [];
    for (const field of section.fields) {
      const text = answerToText(answers[field.key]);
      if (text === "") {
        if (options.includeUnanswered === true) rows.push(`${label(field)}: ${NOT_ANSWERED}`);
        continue;
      }
      // A multi-line answer reads better under its label than beside it.
      rows.push(text.includes("\n") ? `${label(field)}:\n${text}` : `${label(field)}: ${text}`);
    }
    if (rows.length === 0) continue;
    lines.push(section.title.toUpperCase(), ...rows, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** The sections and answers the internal brief view renders, unanswered questions included. */
export function briefSections(
  definition: FormDefinition,
  answers: FormAnswers,
): readonly {
  key: string;
  title: string;
  rows: readonly { key: string; label: string; value: string | null }[];
}[] {
  return definition.sections.map((section) => ({
    key: section.key,
    title: section.title,
    rows: section.fields.map((field) => {
      const text = answerToText(answers[field.key]);
      return { key: field.key, label: field.label, value: text === "" ? null : text };
    }),
  }));
}
