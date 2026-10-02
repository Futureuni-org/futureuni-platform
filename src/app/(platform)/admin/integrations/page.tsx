import type { Metadata } from "next";
import type { z } from "zod";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { listCredentialStatuses, listProviders } from "@/platform/credentials";
import { env } from "@/env";

import { ProviderCard, type ProviderCardData, type ProviderField } from "./_components/integrations-client";

export const metadata: Metadata = { title: "Integrations · Admin" };

function humanize(name: string): string {
  const spaced = name.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function fieldsOf(schema: unknown): ProviderField[] {
  const shape = (schema as z.ZodObject<z.ZodRawShape> | undefined)?.shape;
  if (shape === undefined) {
    return [{ name: "value", label: "Value", secret: true, optional: false }];
  }
  return Object.entries(shape).map(([name, fieldSchema]) => {
    const fs = fieldSchema as unknown as z.ZodType;
    return {
      name,
      label: humanize(name),
      secret: /secret|key|token|password/i.test(name),
      optional: fs.safeParse(undefined).success,
    };
  });
}

export default async function IntegrationsPage() {
  const user = await requireUser();
  if (!canFromUser(user, "platform.credential.read")) {
    return <PermissionState description="Only administrators can manage integrations." />;
  }

  const actor = actorOf(user);
  const [providers, statuses] = await Promise.all([
    Promise.resolve(listProviders()),
    listCredentialStatuses(actor),
  ]);
  const statusByProvider = new Map(statuses.map((s) => [s.provider, s]));
  const canManage = canFromUser(user, "platform.credential.manage");
  const canTest = canFromUser(user, "platform.credential.test");

  const cards: ProviderCardData[] = providers.map((p) => {
    const status = statusByProvider.get(p.id);
    return {
      id: p.id,
      label: p.label,
      category: p.category,
      docsUrl: p.docsUrl,
      signupUrl: p.signupUrl ?? null,
      fields: fieldsOf(p.schema),
      configured: status?.configured ?? false,
      status: status?.status ?? "NOT_TESTED",
      maskedHint: status?.maskedHint ?? null,
      lastTestedAt: status?.lastTestedAt?.toISOString() ?? null,
      lastError: status?.lastError ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        description="Credentials for the external providers the platform uses. Values are encrypted and never shown again."
      />

      {env.MOCKS && (
        <div className="flex items-center gap-2 rounded-md bg-info-soft px-4 py-3 text-sm text-info">
          Mock mode is on (<span className="font-mono">MOCKS=true</span>). Providers use stub
          responses; real credentials aren&apos;t needed to exercise the platform.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {cards.map((card) => (
          <ProviderCard
            key={card.id}
            provider={card}
            timezone={user.timezone}
            canManage={canManage}
            canTest={canTest}
          />
        ))}
      </div>
    </div>
  );
}
