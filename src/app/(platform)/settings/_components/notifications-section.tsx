"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/admin";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { updateNotificationPreferencesAction } from "../actions";

export interface NotificationTypeRow {
  id: string;
  label: string;
  description: string;
  category: "transactional" | "product";
  critical: boolean;
}

type Prefs = Record<string, { IN_APP: boolean; EMAIL: boolean; critical: boolean }>;
type Channel = "IN_APP" | "EMAIL";

const CATEGORY_LABEL: Record<string, string> = {
  product: "Product",
  transactional: "Account",
};

export function NotificationsSection({
  types,
  initialPrefs,
}: {
  types: NotificationTypeRow[];
  initialPrefs: Prefs;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);

  function toggle(typeId: string, channel: Channel, next: boolean) {
    const prev = prefs;
    setPrefs((p) => {
      const existing = p[typeId] ?? { IN_APP: false, EMAIL: false, critical: false };
      return { ...p, [typeId]: { ...existing, [channel]: next } };
    });
    void updateNotificationPreferencesAction([{ type: typeId, channel, enabled: next }]).then((r) => {
      if (!r.ok) {
        setPrefs(prev);
        toast.error(r.error.message);
      }
    });
  }

  const grouped = new Map<string, NotificationTypeRow[]>();
  for (const t of types) {
    const list = grouped.get(t.category) ?? [];
    list.push(t);
    grouped.set(t.category, list);
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted">
        Choose how you&apos;re notified. Critical alerts stay on so you don&apos;t miss them.
      </p>
      {[...grouped.entries()].map(([category, rows]) => (
        <SettingsSection key={category} eyebrow="Notifications" title={CATEGORY_LABEL[category] ?? category} emphasized>
          <div className="flex flex-col divide-y divide-border">
            <div className="hidden grid-cols-[1fr_5rem_5rem] gap-2 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted sm:grid">
              <span>Notification</span>
              <span className="text-center">In-app</span>
              <span className="text-center">Email</span>
            </div>
            {rows.map((t) => {
              const pref = prefs[t.id] ?? { IN_APP: false, EMAIL: false, critical: t.critical };
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_5rem_5rem] sm:items-center"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{t.label}</span>
                    <span className="text-sm text-muted">{t.description}</span>
                  </div>
                  <div className="flex gap-6 sm:contents">
                    <ChannelToggle
                      label="In-app"
                      typeLabel={t.label}
                      checked={pref.IN_APP}
                      critical={t.critical}
                      onChange={(v) => {
                        toggle(t.id, "IN_APP", v);
                      }}
                    />
                    <ChannelToggle
                      label="Email"
                      typeLabel={t.label}
                      checked={pref.EMAIL}
                      critical={t.critical}
                      onChange={(v) => {
                        toggle(t.id, "EMAIL", v);
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsSection>
      ))}
    </div>
  );
}

function ChannelToggle({
  label,
  typeLabel,
  checked,
  critical,
  onChange,
}: {
  label: string;
  typeLabel: string;
  checked: boolean;
  critical: boolean;
  onChange: (next: boolean) => void;
}) {
  const ariaLabel = `${label} for ${typeLabel}`;
  if (critical) {
    return (
      <span className="flex items-center gap-1 sm:justify-center">
        <Tooltip label="Critical alert — always on">
          <span className="flex items-center gap-1 text-muted">
            <Lock aria-hidden className="size-4" />
            <span className="sm:hidden">{label}</span>
            <span className="sr-only">{ariaLabel}: always on (critical)</span>
          </span>
        </Tooltip>
      </span>
    );
  }
  return (
    <label className={cn("flex items-center gap-2 sm:justify-center")}>
      <span className="text-sm text-muted sm:hidden">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="size-5 rounded border-input accent-primary"
      />
    </label>
  );
}
