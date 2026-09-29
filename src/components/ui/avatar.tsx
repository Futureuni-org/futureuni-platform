"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { forwardRef } from "react";

import { cn } from "@/lib/cn";

const SIZE_CLASSES = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-12 text-base",
} as const;

type AvatarSize = keyof typeof SIZE_CLASSES;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export const Avatar = forwardRef<
  HTMLSpanElement,
  {
    name: string;
    src?: string | null;
    size?: AvatarSize;
    className?: string;
  }
>(function Avatar({ name, src, size = "md", className }, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary-soft-foreground font-semibold",
        SIZE_CLASSES[size],
        className,
      )}
      aria-label={name}
    >
      {src !== undefined && src !== null && src !== "" && (
        <AvatarPrimitive.Image
          src={src}
          alt=""
          className="size-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback delayMs={300}>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
});

export function AvatarGroup({
  people,
  max = 3,
  size = "sm",
  className,
}: {
  people: { name: string; src?: string | null }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  return (
    <span className={cn("inline-flex items-center -space-x-2", className)}>
      {shown.map((person) => (
        <Avatar
          key={person.name}
          name={person.name}
          src={person.src ?? null}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-zone text-muted font-medium ring-2 ring-background",
            SIZE_CLASSES[size],
          )}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
