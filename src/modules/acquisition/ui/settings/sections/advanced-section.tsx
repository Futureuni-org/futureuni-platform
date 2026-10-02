"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { SettingsSection } from "@/components/admin";
import { Textarea } from "@/components/ui/textarea";
import { ServiceLineProfileSchema } from "@/contracts/service-line-profile";
import { useDraft } from "../profile-draft-context";

/**
 * Advanced — the raw JSON of the draft, validated against the contract schema before it updates the
 * draft. ADMIN only. A safety net for edits the sectioned forms don't cover.
 */
export function AdvancedSection() {
  const { draft, canEdit, update } = useDraft();
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [errors, setErrors] = useState<string[]>([]);

  function onEdit(next: string) {
    setText(next);
    let parsed: unknown;
    try {
      parsed = JSON.parse(next);
    } catch {
      setErrors(["Invalid JSON"]);
      return;
    }
    const result = ServiceLineProfileSchema.safeParse(parsed);
    if (!result.success) {
      setErrors(result.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`));
      return;
    }
    setErrors([]);
    update(() => result.data);
  }

  return (
    <SettingsSection
      eyebrow="Advanced"
      title="JSON view"
      description="The whole draft as JSON. Changes apply only when they pass the contract schema."
    >
      <div className="flex items-start gap-2 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Editing JSON directly can break the profile in ways the forms prevent. Take care.</span>
      </div>
      <Textarea
        value={text}
        rows={24}
        disabled={!canEdit}
        aria-label="Profile JSON"
        onChange={(e) => {
          onEdit(e.target.value);
        }}
        className="font-mono text-xs"
      />
      {errors.length > 0 && (
        <div role="alert" aria-live="polite" className="flex flex-col gap-1 text-sm text-danger">
          {errors.map((e, i) => (
            <span key={i}>{e}</span>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
