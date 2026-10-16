"use client";

/**
 * One submitted brief, as the team reads it (docs/specs/module-forms.md §6).
 *
 * Unanswered questions are shown as "Not answered" rather than hidden: the gap is information —
 * it is what the next call with the client is about.
 */

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface BriefSection {
  key: string;
  title: string;
  rows: readonly { key: string; label: string; value: string | null }[];
}

export function BriefView({
  sections,
  text,
}: {
  sections: readonly BriefSection[];
  /** The same brief as plain text, for pasting into a proposal or a chat. */
  text: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <CopyBrief text={text} />
      {sections.map((section) => (
        <section key={section.key} className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold text-heading">{section.title}</h2>
          <dl className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {section.rows.map((row) => (
              <div key={row.key} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                <dt className="text-sm font-medium text-muted">{row.label}</dt>
                <dd
                  className={
                    row.value === null
                      ? "text-sm text-subtle italic"
                      : "whitespace-pre-wrap text-foreground"
                  }
                >
                  {row.value ?? "Not answered"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function CopyBrief({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="self-start"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2_000);
          })
          .catch(() => {
            setCopied(false);
          });
      }}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      {copied ? "Copied" : "Copy as text"}
    </Button>
  );
}
