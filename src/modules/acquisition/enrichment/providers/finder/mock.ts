/**
 * Mock email finder (Phase 9). Deterministic candidates so tests can rely on the shape without
 * a real Hunter/Apollo account. Used whenever `MOCKS=true`.
 */

import "server-only";

import type { EmailFinder, FoundEmailSchema } from "@/contracts/enrichment";
import type { z } from "zod";

type FoundEmail = z.infer<typeof FoundEmailSchema>;

const NAMES: { firstName: string; lastName: string; position: string; confidence: number }[] = [
  { firstName: "Ada", lastName: "Adeleke", position: "Founder", confidence: 88 },
  { firstName: "Chinedu", lastName: "Okafor", position: "Operations Manager", confidence: 74 },
  { firstName: "Grace", lastName: "Williams", position: "Marketing Manager", confidence: 62 },
];

export const mockFinder: EmailFinder = {
  id: "mock",
  domainSearch: (domain, opts) => {
    const limit = opts?.limit ?? 25;
    const out: FoundEmail[] = NAMES.slice(0, limit).map(({ firstName, lastName, position, confidence }) => ({
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      firstName,
      lastName,
      position,
      confidence,
      sources: [],
    }));
    return Promise.resolve(out);
  },
  findEmail: ({ domain, firstName, lastName }) =>
    Promise.resolve<FoundEmail>({
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      firstName,
      lastName,
      confidence: 78,
      sources: [],
    }),
};
