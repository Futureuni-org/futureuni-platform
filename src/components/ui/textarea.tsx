"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/cn";

/** Auto-growing textarea (adjusts to content height, capped by `maxRows`). */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean; maxRows?: number }
>(function Textarea({ className, autoGrow = true, maxRows = 12, onInput, ...props }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => {
    if (inner.current === null) throw new Error("Textarea ref unavailable");
    return inner.current;
  });

  useEffect(() => {
    if (!autoGrow || inner.current === null) return;
    resize(inner.current, maxRows);
  }, [autoGrow, maxRows, props.value]);

  return (
    <textarea
      ref={inner}
      className={cn(
        "flex min-h-24 w-full resize-y rounded-md border border-input bg-surface px-3 py-2 text-base text-foreground",
        "placeholder:text-subtle",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      onInput={(event) => {
        if (autoGrow) resize(event.currentTarget, maxRows);
        onInput?.(event);
      }}
      {...props}
    />
  );
});

function resize(el: HTMLTextAreaElement, maxRows: number): void {
  el.style.height = "auto";
  const lineHeight = parseInt(getComputedStyle(el).lineHeight, 10) || 24;
  const cap = lineHeight * maxRows;
  el.style.height = `${String(Math.min(el.scrollHeight, cap))}px`;
}
