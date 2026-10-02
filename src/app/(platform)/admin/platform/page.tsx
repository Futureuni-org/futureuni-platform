import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { SettingsSection, SettingField, type SettingFieldDescriptor } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";
import { listSettings, getSetting, PLATFORM_SETTINGS } from "@/platform/settings";
import { getAllModules, getEnabledModules, getSettingDefinitions } from "@/platform/registry";

import { saveSettingAction } from "./actions";
import { ModuleToggle, RetentionPreview } from "./_components/platform-client";

export const metadata: Metadata = { title: "Platform · Admin" };

const ENUM_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "acquisition.compliance.ngDirectMarketingBasis": [
    { value: "PENDING_LEGAL_REVIEW", label: "Pending legal review" },
    { value: "LEGITIMATE_INTEREST_CONFIRMED", label: "Legitimate interest confirmed" },
    { value: "CONSENT_ONLY", label: "Consent only" },
  ],
};

function describe(key: string, value: unknown, defaultValue: unknown): SettingFieldDescriptor {
  if (ENUM_OPTIONS[key] !== undefined) return { kind: "enum", options: ENUM_OPTIONS[key] };
  const v = value ?? defaultValue;
  if (typeof v === "boolean") return { kind: "boolean" };
  if (typeof v === "number") return { kind: "number" };
  if (Array.isArray(v)) return { kind: "stringArray" };
  if (v !== null && typeof v === "object") return { kind: "json" };
  if (key === "platform.retention.auditLogMonths") return { kind: "number", nullable: true };
  if (key === "platform.postalAddress") return { kind: "string", multiline: true };
  return { kind: "string" };
}

export default async function PlatformPage() {
  const user = await requireUser();
  if (!canFromUser(user, "platform.setting.read")) {
    return <PermissionState description="Only administrators and managers can view platform settings." />;
  }

  const defs = new Map([...PLATFORM_SETTINGS, ...getSettingDefinitions()].map((d) => [d.key, d]));
  const [platformItems, moduleItems, postalAddress, allModules, enabledModules] = await Promise.all([
    listSettings({ scope: "PLATFORM" }),
    listSettings({ scope: "MODULE" }),
    getSetting<string>("platform.postalAddress", {}),
    Promise.resolve(getAllModules()),
    getEnabledModules(),
  ]);

  const items = [...platformItems, ...moduleItems].filter(
    (i) => !i.key.startsWith("ai.") && !i.key.startsWith("module."),
  );

  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const group = item.key.startsWith("platform.retention.")
      ? "Retention"
      : item.scope === "PLATFORM"
        ? "General"
        : `Module: ${item.module ?? "acquisition"}`;
    const list = groups.get(group) ?? [];
    list.push(item);
    groups.set(group, list);
  }

  const enabledIds = new Set(enabledModules.map((m) => m.id));
  const canToggleModules = canFromUser(user, "platform.module.toggle");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Admin" title="Platform" description="Platform-wide settings, retention, and modules." />

      {postalAddress.trim() === "" && (
        <div role="alert" className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          The postal address is empty. Outreach email is blocked until it&apos;s set (INV-4) — add it
          under General below.
        </div>
      )}

      {[...groups.entries()].map(([group, groupItems]) => (
        <SettingsSection key={group} eyebrow="Settings" title={group} emphasized={group === "General"}>
          {groupItems.map((item) => {
            const def = defs.get(item.key);
            return (
              <SettingField
                key={item.key}
                settingKey={item.key}
                label={item.label}
                description={item.description}
                descriptor={describe(item.key, item.value, def?.default)}
                value={item.value}
                defaultValue={def?.default ?? null}
                isDefault={item.isDefault}
                canEdit={canFromUser(user, item.requiredPermission)}
                onSave={saveSettingAction}
              />
            );
          })}
        </SettingsSection>
      ))}

      <SettingsSection eyebrow="Retention" title="Purge preview" description="Personal data on DISQUALIFIED and LOST leads is anonymised after the retention period.">
        <RetentionPreview canPreview={canFromUser(user, "acquisition.retention.preview")} />
      </SettingsSection>

      <SettingsSection eyebrow="Modules" title="Modules" description="Enable or disable platform modules.">
        <div className="flex flex-col gap-4">
          {allModules.map((m) => (
            <ModuleToggle
              key={m.id}
              moduleId={m.id}
              name={m.name}
              description={m.description}
              enabled={enabledIds.has(m.id)}
              canToggle={canToggleModules}
            />
          ))}
        </div>
      </SettingsSection>
    </div>
  );
}
