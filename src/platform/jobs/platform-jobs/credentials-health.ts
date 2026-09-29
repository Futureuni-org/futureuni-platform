import "server-only";

import type { JobResult } from "@/contracts/jobs";
import { publish } from "@/platform/events";
import { getProvider, listCredentialStatuses } from "@/platform/credentials";
import { getCredential } from "@/platform/credentials";

export async function runCredentialsHealth(): Promise<JobResult> {
  const statuses = await listCredentialStatuses({ type: "SYSTEM", job: "platform.credentials-health" });
  let ok = 0;
  let failing = 0;
  for (const status of statuses) {
    if (!status.configured) continue;
    const provider = getProvider(status.provider);
    if (provider === null) continue;
    const payload = await getCredential(status.provider);
    if (payload === null) continue;
    const result = await provider.test(payload);
    if (result.ok) {
      ok += 1;
    } else {
      failing += 1;
      await publish({
        name: "integration.failing",
        actor: { type: "SYSTEM", job: "platform.credentials-health" },
        payload: { provider: status.provider, error: result.error.slice(0, 500) },
      });
    }
  }
  return { counts: { ok, failing } };
}
