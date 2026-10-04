import type { SelectOption } from "@/components/admin";

/**
 * `options` with `person` added when they aren't already in it. A select shows the first option
 * when its value matches none, so a lead whose owner has since left the line's team would display
 * someone else's name, and saving the form would reassign it. The current person is always listed.
 * Client-safe.
 */
export function withPerson(
  options: readonly SelectOption[],
  person: { id: string; name: string | null } | null,
): SelectOption[] {
  if (person === null || options.some((option) => option.value === person.id)) {
    return [...options];
  }
  return [...options, { value: person.id, label: person.name ?? "Unnamed teammate" }];
}
