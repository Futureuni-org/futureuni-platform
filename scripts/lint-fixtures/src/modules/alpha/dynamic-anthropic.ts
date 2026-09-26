// Violation: a dynamic import of the Anthropic SDK outside src/platform/ai.
export async function loadSdk(): Promise<unknown> {
  return import("@anthropic-ai/sdk");
}
