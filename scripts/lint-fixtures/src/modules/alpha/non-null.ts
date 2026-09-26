// Violation: a non-null assertion.
export function first(values: string[]): string {
  const value = values.find((item) => item.length > 0);
  return value!;
}
