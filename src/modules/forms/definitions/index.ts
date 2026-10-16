/**
 * The form registry (docs/specs/module-forms.md §2).
 *
 * F1 keeps definitions in code: this array is the single list of forms the platform serves. Each
 * one is validated against `FormDefinitionSchema` the first time the registry is read, so a typo
 * in a definition fails loudly in development and in CI rather than at a prospect's browser.
 *
 * F2 adds a database-backed loader in front of this array (DB first, code as the fallback). The
 * functions below are the seam: callers use them and never touch the array.
 */

import { FormDefinitionSchema, type FormDefinition } from "@/contracts/forms";

import { aiMusicVideoBrief } from "./ai-music-video-brief";

const RAW: readonly FormDefinition[] = [aiMusicVideoBrief];

let validated: readonly FormDefinition[] | null = null;

function all(): readonly FormDefinition[] {
  if (validated === null) {
    const slugs = new Set<string>();
    validated = RAW.map((definition) => {
      const parsed = FormDefinitionSchema.safeParse(definition);
      if (!parsed.success) {
        throw new Error(
          `Form "${definition.slug}" is not a valid definition: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")} ${issue.message}`)
            .join("; ")}`,
        );
      }
      if (slugs.has(parsed.data.slug)) {
        throw new Error(`Two forms share the slug "${parsed.data.slug}".`);
      }
      slugs.add(parsed.data.slug);
      return parsed.data;
    });
  }
  return validated;
}

/** Every form, in registry order, whatever its status. For the internal list. */
export function listForms(): readonly FormDefinition[] {
  return all();
}

/** One form by slug, whatever its status, or undefined. */
export function getForm(slug: string): FormDefinition | undefined {
  return all().find((definition) => definition.slug === slug);
}

/** One form by slug, only if a prospect may fill it in. The public route uses this. */
export function getPublishedForm(slug: string): FormDefinition | undefined {
  const definition = getForm(slug);
  return definition?.status === "PUBLISHED" ? definition : undefined;
}

/** For tests only: drop the validated cache. */
export function _resetFormRegistry(): void {
  validated = null;
}
