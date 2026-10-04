"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

/**
 * A tag input for keywords: type and press Enter or comma to add, Backspace on an empty field to
 * remove the last tag. Local to acquisition UI; a promote candidate (see phases/15/REQUESTS.md).
 */

export function TagInput({
  tags,
  onChange,
  placeholder,
  label,
  max = 20,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label: string;
  max?: number;
}): React.ReactElement {
  const [draft, setDraft] = useState("");
  const id = useId();

  function add(raw: string): void {
    const value = raw.trim();
    if (value.length < 2) return;
    if (tags.includes(value) || tags.length >= max) {
      setDraft("");
      return;
    }
    onChange([...tags, value]);
    setDraft("");
  }

  function removeAt(index: number): void {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div
      className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      onClick={() => {
        document.getElementById(id)?.focus();
      }}
    >
      {tags.map((tag, index) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-[0.3rem] bg-primary-soft py-0.5 pl-2 pr-1 text-sm text-primary-soft-foreground"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={(event) => {
              event.stopPropagation();
              removeAt(index);
            }}
            className="inline-flex size-5 items-center justify-center rounded-full hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        aria-label={label}
        value={draft}
        placeholder={tags.length === 0 ? placeholder : undefined}
        autoComplete="off"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && draft.length === 0 && tags.length > 0) {
            removeAt(tags.length - 1);
          }
        }}
        onBlur={() => {
          if (draft.trim().length > 0) add(draft);
        }}
        className="min-w-24 flex-1 bg-transparent px-1 py-1 text-base text-foreground placeholder:text-subtle focus-visible:outline-none"
      />
    </div>
  );
}
