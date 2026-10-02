import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { SettingsSection } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";
import { listPromptVersions } from "@/platform/ai";
import { getAllAiTasks } from "@/platform/registry";

import { TaskPanel, type TaskVersion } from "./_components/prompts-client";

export const metadata: Metadata = { title: "Prompts · Admin" };

export default async function PromptsPage() {
  const user = await requireUser();
  if (!canFromUser(user, "platform.prompt.read")) {
    return <PermissionState description="Only administrators can manage prompt versions." />;
  }

  const tasks = getAllAiTasks();
  const withVersions = await Promise.all(
    tasks.map(async (t) => ({
      id: t.id,
      module: t.module,
      description: t.description,
      versions: (await listPromptVersions(t.id)).map(
        (v): TaskVersion => ({
          version: v.version,
          isActive: v.isActive,
          evalScore: v.evalScore,
          publishedAt: v.publishedAt.toISOString(),
          changelog: v.changelog,
        }),
      ),
    })),
  );

  const byModule = new Map<string, typeof withVersions>();
  for (const t of withVersions) {
    const list = byModule.get(t.module) ?? [];
    list.push(t);
    byModule.set(t.module, list);
  }

  const canPublish = canFromUser(user, "platform.prompt.publish");
  const canActivate = canFromUser(user, "platform.prompt.activate");
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Admin"
        title="Prompts"
        description="AI prompt versions by task. Publishing runs the eval suite and is blocked on a regression."
      />
      {withVersions.length === 0 ? (
        <EmptyState title="No AI tasks registered" description="Tasks appear here once a module registers them." />
      ) : (
        [...byModule.entries()].map(([moduleId, moduleTasks]) => (
          <SettingsSection key={moduleId} eyebrow="Module" title={moduleId} emphasized>
            <div className="flex flex-col gap-3">
              {moduleTasks.map((t) => (
                <TaskPanel
                  key={t.id}
                  task={t.id}
                  description={t.description}
                  versions={t.versions}
                  timezone={user.timezone}
                  canPublish={canPublish}
                  canActivate={canActivate}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </SettingsSection>
        ))
      )}
    </div>
  );
}
