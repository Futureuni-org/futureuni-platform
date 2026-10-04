"use client";

import { useId, useRef, useState } from "react";

/**
 * A free-text combobox with quick-pick suggestions. The typed value is always accepted; the
 * suggestion list just speeds common choices. Keyboard: ArrowUp/Down to move, Enter to pick,
 * Escape to close. Local to acquisition UI; a promote candidate (see phases/15/REQUESTS.md).
 */

export function Combobox({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  placeholder?: string;
  label: string;
  id?: string;
}): React.ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<number | undefined>(undefined);

  const query = value.trim().toLowerCase();
  const filtered = suggestions.filter((s) => s.toLowerCase().includes(query)).slice(0, 8);

  function choose(next: string): void {
    onChange(next);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        aria-label={label}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => {
            setOpen(false);
          }, 120);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (event.key === "Enter" && open && active >= 0) {
            event.preventDefault();
            const picked = filtered[active];
            if (picked !== undefined) choose(picked);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className="h-11 w-full rounded-md border border-input bg-surface px-3 text-base text-foreground placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-elevated p-1 shadow-lift"
          onMouseDown={(event) => {
            // Keep focus so the blur-close doesn't fire before the click.
            event.preventDefault();
          }}
        >
          {filtered.map((suggestion, index) => (
            <li
              key={suggestion}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={index === active}
              onClick={() => {
                window.clearTimeout(blurTimer.current);
                choose(suggestion);
              }}
              className={[
                "cursor-pointer rounded-[0.3rem] px-3 py-2 text-sm",
                index === active ? "bg-primary-soft text-primary-soft-foreground" : "text-foreground hover:bg-zone",
              ].join(" ")}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
