// Violation: console.log (console.warn and console.error are allowed).
export function report(message: string): void {
  console.log(message);
  console.warn(message);
}
