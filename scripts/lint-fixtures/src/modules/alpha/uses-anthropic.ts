// Violation: the Anthropic SDK outside src/platform/ai.
import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic({ apiKey: "test" });
