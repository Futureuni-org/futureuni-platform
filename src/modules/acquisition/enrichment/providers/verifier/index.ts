import "server-only";

import { env } from "@/env";
import type { EmailVerifier } from "@/contracts/enrichment";

import { hunterVerifier } from "./hunter";
import { mockVerifier } from "./mock";

export function getEmailVerifier(): EmailVerifier {
  return env.MOCKS ? mockVerifier : hunterVerifier;
}

export { hunterVerifier, mockVerifier };
