import { describe, expect, it } from "vitest";

import {
  FORM_LIMITS,
  FormAnswersSchema,
  FormDefinitionSchema,
  FormFieldSchema,
  fieldWithRole,
  formFields,
  isBlankAnswer,
} from "./forms";

/** Raw data for the schemas: a test feeds them unvalidated input on purpose. */
function definition(overrides: Record<string, unknown> = {}): unknown {
  return {
    slug: "a-form",
    title: "A form",
    intro: ["Why we are asking."],
    status: "PUBLISHED",
    version: 1,
    sections: [
      {
        key: "one",
        title: "One",
        fields: [{ key: "name", kind: "shortText", label: "Your name", required: true }],
      },
    ],
    closing: { title: "Done", body: ["Thank you."] },
    ...overrides,
  };
}

describe("FormFieldSchema", () => {
  it("requires choices on a choice field", () => {
    const result = FormFieldSchema.safeParse({
      key: "shape",
      kind: "singleChoice",
      label: "What shape?",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("needs choices");
  });

  it("rejects choices on a text field", () => {
    const result = FormFieldSchema.safeParse({
      key: "name",
      kind: "shortText",
      label: "Your name",
      choices: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a key that isn't lowerCamelCase", () => {
    expect(
      FormFieldSchema.safeParse({ key: "Your name", kind: "shortText", label: "x" }).success,
    ).toBe(false);
  });
});

describe("FormDefinitionSchema", () => {
  it("accepts a minimal definition", () => {
    expect(FormDefinitionSchema.safeParse(definition()).success).toBe(true);
  });

  it("rejects two fields sharing a key", () => {
    const result = FormDefinitionSchema.safeParse(
      definition({
        sections: [
          {
            key: "one",
            title: "One",
            fields: [
              { key: "name", kind: "shortText", label: "Name" },
              { key: "name", kind: "shortText", label: "Name again" },
            ],
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("Duplicate field"))).toBe(
      true,
    );
  });

  it("rejects a slug that isn't kebab-case", () => {
    expect(FormDefinitionSchema.safeParse(definition({ slug: "Not A Slug" })).success).toBe(false);
  });
});

describe("FormAnswersSchema", () => {
  it("accepts text and lists", () => {
    expect(FormAnswersSchema.safeParse({ name: "Ada", style: ["a", "b"] }).success).toBe(true);
  });

  it("caps a single answer's length", () => {
    const tooLong = "x".repeat(FORM_LIMITS.answerChars + 1);
    expect(FormAnswersSchema.safeParse({ name: tooLong }).success).toBe(false);
  });

  it("caps the number of selections", () => {
    const tooMany = Array.from({ length: FORM_LIMITS.selections + 1 }, (_, i) => String(i));
    expect(FormAnswersSchema.safeParse({ style: tooMany }).success).toBe(false);
  });

  it("rejects a value that is neither text nor a list of text", () => {
    expect(FormAnswersSchema.safeParse({ name: 42 }).success).toBe(false);
    expect(FormAnswersSchema.safeParse({ name: { nested: "no" } }).success).toBe(false);
  });
});

describe("helpers", () => {
  const parsed = FormDefinitionSchema.parse(
    definition({
      sections: [
        {
          key: "one",
          title: "One",
          fields: [
            { key: "name", kind: "shortText", label: "Name", role: "contactName" },
            { key: "email", kind: "email", label: "Email", role: "contactEmail" },
          ],
        },
      ],
    }),
  );

  it("flattens every field in order", () => {
    expect(formFields(parsed).map((field) => field.key)).toEqual(["name", "email"]);
  });

  it("finds the field carrying a role", () => {
    expect(fieldWithRole(parsed, "contactEmail")?.key).toBe("email");
    expect(fieldWithRole(parsed, "contactPhone")).toBeUndefined();
  });

  it("treats whitespace, empty lists and undefined as blank", () => {
    expect(isBlankAnswer(undefined)).toBe(true);
    expect(isBlankAnswer("   ")).toBe(true);
    expect(isBlankAnswer([])).toBe(true);
    expect(isBlankAnswer("Ada")).toBe(false);
    expect(isBlankAnswer(["a"])).toBe(false);
  });
});
