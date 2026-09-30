import "server-only";

import { env } from "@/env";
import type { EmailFinder } from "@/contracts/enrichment";

import { hunterFinder } from "./hunter";
import { mockFinder } from "./mock";

export function getEmailFinder(): EmailFinder {
  return env.MOCKS ? mockFinder : hunterFinder;
}

export { hunterFinder, mockFinder };
