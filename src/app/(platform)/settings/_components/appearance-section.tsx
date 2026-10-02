"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SettingsSection, Field, Select } from "@/components/admin";
import { CheckboxField } from "@/modules/acquisition/ui/settings/editor-fields";
import { useTheme, THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { updateUserSettingAction } from "../actions";

export function AppearanceSection({
  initialDensity,
  initialReducedMotion,
}: {
  initialDensity: "comfortable" | "compact";
  initialReducedMotion: boolean;
}) {
  const { preference, setPreference } = useTheme();
  const [density, setDensity] = useState(initialDensity);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [, startTransition] = useTransition();

  function persist(key: string, value: unknown, label: string) {
    startTransition(async () => {
      const result = await updateUserSettingAction(key, value);
      if (!result.ok) toast.error(result.error.message);
      else toast.success(`${label} saved`);
    });
  }

  return (
    <SettingsSection eyebrow="Appearance" title="How the platform looks" emphasized>
      <Field label="Theme" description="Light, dark, or follow your device.">
        {({ id }) => (
          <Select
            id={id}
            value={preference}
            options={THEME_PREFERENCES.map((p) => ({
              value: p,
              label: p === "system" ? "System" : p === "dark" ? "Dark" : "Light",
            }))}
            onChange={(e) => {
              const next = e.target.value as ThemePreference;
              setPreference(next);
              persist("user.theme", next, "Theme");
            }}
          />
        )}
      </Field>

      <Field label="Density" description="Comfortable spacing, or compact to fit more on screen.">
        {({ id }) => (
          <Select
            id={id}
            value={density}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(e) => {
              const next = e.target.value as "comfortable" | "compact";
              setDensity(next);
              persist("user.density", next, "Density");
            }}
          />
        )}
      </Field>

      <CheckboxField
        label="Reduce motion"
        description="Turn off non-essential animations for this account."
        checked={reducedMotion}
        onChange={(checked) => {
          setReducedMotion(checked);
          persist("user.reducedMotion", checked, "Reduced motion");
        }}
      />
    </SettingsSection>
  );
}
