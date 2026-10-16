/**
 * Client Forms contract (docs/specs/module-forms.md §4, §7).
 *
 * One shape describes a form everywhere: the renderer builds fields from it, the server validates
 * answers against it, and F2's builder will persist exactly this JSON into `frm_form_definitions`.
 * Nothing else may define what a question is.
 *
 * Caps live here, so the browser and the server never disagree about what is too long.
 */

import { z } from "zod";

import { KebabIdSchema, ServiceLineSchema, type FormSubmissionStatus } from "./common";

/** Per-answer and per-payload limits (spec §7). */
export const FORM_LIMITS = {
  /** One text answer. */
  answerChars: 5_000,
  /** Selections in one multi-choice answer. */
  selections: 40,
  /** The whole answers object, serialised. */
  payloadBytes: 128 * 1024,
} as const;

/** The question kinds F1 renders. F3 adds file, number and date. */
export const FORM_FIELD_KINDS = [
  "shortText",
  "longText",
  "email",
  "phone",
  "url",
  "singleChoice",
  "multiChoice",
] as const;
export const FormFieldKindSchema = z.enum(FORM_FIELD_KINDS);
export type FormFieldKind = z.infer<typeof FormFieldKindSchema>;

/**
 * What a field means to the business, beyond its label. Used to denormalise a submission for the
 * list view without re-reading the answers JSON (spec §4).
 */
export const FormFieldRoleSchema = z.enum(["contactName", "contactEmail", "contactPhone"]);
export type FormFieldRole = z.infer<typeof FormFieldRoleSchema>;

/** One option of a choice field. `value` is what gets stored and must never be re-worded. */
export const FormChoiceSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
});
export type FormChoice = z.infer<typeof FormChoiceSchema>;

const FieldKeySchema = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]{0,47}$/, { error: "lowerCamelCase field key" });

/** One question. */
export const FormFieldSchema = z
  .object({
    key: FieldKeySchema,
    kind: FormFieldKindSchema,
    /** The question as the prospect reads it. */
    label: z.string().min(1).max(300),
    /** The sentence under the question that stops the most common misunderstanding. */
    help: z.string().max(600).optional(),
    placeholder: z.string().max(200).optional(),
    required: z.boolean().optional(),
    /** Only for `singleChoice` and `multiChoice`. */
    choices: z.array(FormChoiceSchema).min(2).max(40).optional(),
    /** `half` lets two short fields sit side by side from 640px up. */
    width: z.enum(["full", "half"]).optional(),
    /** A shorter label for the plain-text brief; defaults to `label`. */
    briefLabel: z.string().min(1).max(120).optional(),
    role: FormFieldRoleSchema.optional(),
  })
  .superRefine((field, ctx) => {
    const isChoice = field.kind === "singleChoice" || field.kind === "multiChoice";
    if (isChoice && field.choices === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["choices"],
        message: `"${field.key}" is a ${field.kind} field, so it needs choices.`,
      });
    }
    if (!isChoice && field.choices !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["choices"],
        message: `"${field.key}" is a ${field.kind} field, so it must not have choices.`,
      });
    }
  });
export type FormField = z.infer<typeof FormFieldSchema>;

/** A numbered group of questions, with its own introduction. */
export const FormSectionSchema = z.object({
  key: KebabIdSchema,
  title: z.string().min(1).max(120),
  /** One line under the heading saying why we ask. */
  intro: z.string().max(400).optional(),
  fields: z.array(FormFieldSchema).min(1).max(40),
  /** A closing note shown after the fields — the consequence the prospect should know. */
  note: z.string().max(600).optional(),
});
export type FormSection = z.infer<typeof FormSectionSchema>;

export const FormStatusSchema = z.enum(["DRAFT", "PUBLISHED", "CLOSED"]);
export type FormStatus = z.infer<typeof FormStatusSchema>;

/** What the prospect sees after submitting, and how they reach us if anything failed. */
export const FormClosingSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.array(z.string().min(1).max(600)).min(1).max(6),
  whatsapp: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
});
export type FormClosing = z.infer<typeof FormClosingSchema>;

/** A whole form. The slug is the public URL: `/f/<slug>`. */
export const FormDefinitionSchema = z
  .object({
    slug: KebabIdSchema,
    title: z.string().min(1).max(160),
    /** The line above the title, e.g. "FUTUREUNI · Video". */
    eyebrow: z.string().max(80).optional(),
    /** Opening paragraphs, in order. */
    intro: z.array(z.string().min(1).max(800)).min(1).max(5),
    /** How long it takes and what the prospect may skip — set expectations before question one. */
    expectation: z.string().max(400).optional(),
    status: FormStatusSchema,
    /** Bumped whenever the questions change, so a brief records what was actually asked. */
    version: z.int().positive(),
    /** Which FUTUREUNI service line the job belongs to. Metadata only; no cross-module import. */
    serviceLine: ServiceLineSchema.optional(),
    /** Who the form was built for, shown in the internal list only. */
    prospectLabel: z.string().max(120).optional(),
    sections: z.array(FormSectionSchema).min(1).max(40),
    closing: FormClosingSchema,
  })
  .superRefine((definition, ctx) => {
    const keys = new Set<string>();
    const sectionKeys = new Set<string>();
    for (const section of definition.sections) {
      if (sectionKeys.has(section.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections"],
          message: `Duplicate section key "${section.key}".`,
        });
      }
      sectionKeys.add(section.key);
      for (const field of section.fields) {
        if (keys.has(field.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections"],
            message: `Duplicate field key "${field.key}".`,
          });
        }
        keys.add(field.key);
      }
    }
  });
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

/** One answer: text, or the chosen values of a multi-choice field. */
export const FormAnswerSchema = z.union([
  z.string().max(FORM_LIMITS.answerChars),
  z.array(z.string().max(FORM_LIMITS.answerChars)).max(FORM_LIMITS.selections),
]);
export type FormAnswer = z.infer<typeof FormAnswerSchema>;

/** Every answer, keyed by field key. Unknown keys are rejected against the definition, not here. */
export const FormAnswersSchema = z.record(FieldKeySchema, FormAnswerSchema);
export type FormAnswers = z.infer<typeof FormAnswersSchema>;

/** What the public page sends when the prospect submits. */
export const FormSubmissionInputSchema = z.object({
  slug: KebabIdSchema,
  version: z.int().positive(),
  answers: FormAnswersSchema,
});
export type FormSubmissionInput = z.infer<typeof FormSubmissionInputSchema>;

/**
 * The stored status. The values come from the Prisma enum, which `./common` already re-exports as
 * `FormSubmissionStatus` — this is the Zod view of it, not a second source of truth.
 */
export const FormSubmissionStatusSchema = z.enum(["COMPLETE"]);

/** A stored brief, as the internal screens read it. */
export interface FormSubmissionRecord {
  id: string;
  formSlug: string;
  formVersion: number;
  formTitle: string;
  status: FormSubmissionStatus;
  answers: FormAnswers;
  contactName: string | null;
  contactEmail: string | null;
  submittedAt: Date;
}

/** True when the answer carries nothing the team can read. */
export function isBlankAnswer(answer: FormAnswer | undefined): boolean {
  if (answer === undefined) return true;
  if (typeof answer === "string") return answer.trim() === "";
  return answer.length === 0;
}

/** Every field of a definition, flattened in the order the prospect meets them. */
export function formFields(definition: FormDefinition): readonly FormField[] {
  return definition.sections.flatMap((section) => section.fields);
}

/** The field marked with a role, if the definition declares one. */
export function fieldWithRole(
  definition: FormDefinition,
  role: FormFieldRole,
): FormField | undefined {
  return formFields(definition).find((field) => field.role === role);
}
