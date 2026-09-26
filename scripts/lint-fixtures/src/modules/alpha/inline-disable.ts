// Violation: eslint-disable comments are ignored, so the rule still fires.
/* eslint-disable */
export function shout(message: string): void {
  console.log(message);
}
