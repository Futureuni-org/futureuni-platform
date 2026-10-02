"use client";

import { Badge } from "@/components/ui/badge";
import type { ProfileDiff } from "@/modules/acquisition/profiles";

const KIND_TONE = { added: "success", removed: "danger", modified: "info" } as const;

function stringify(value: unknown): string {
  if (value === undefined) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserialisable]";
  }
}

/** Renders a ProfileDiff grouped by top-level section, in plain terms with before/after. */
export function DiffView({ diff }: { diff: ProfileDiff }) {
  if (!diff.hasChanges) {
    return <p className="text-sm text-muted">No changes from the active version.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {diff.entries.map((entry, i) => (
        <li key={i} className="flex flex-col gap-2 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={KIND_TONE[entry.kind]}>{entry.kind}</Badge>
            <span className="font-mono text-sm text-foreground">{entry.path}</span>
          </div>
          {entry.kind === "modified" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-muted">
                {stringify(entry.before)}
              </pre>
              <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-foreground">
                {stringify(entry.after)}
              </pre>
            </div>
          ) : (
            <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-foreground">
              {stringify(entry.kind === "added" ? entry.after : entry.before)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  );
}
