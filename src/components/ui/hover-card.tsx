"use client";

import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import { forwardRef } from "react";

import { cn } from "@/lib/cn";

export const HoverCard = HoverCardPrimitive.Root;
export const HoverCardTrigger = HoverCardPrimitive.Trigger;

/**
 * A mouse-hover flyout (Radix HoverCard), portaled so it escapes clipping ancestors. Used by the
 * collapsed sidebar to reveal an item's label and its sub-items. Keyboard users reach the same
 * routes through the trigger link itself and the in-page tabs, since hover cards do not open on
 * focus by design.
 */
export const HoverCardContent = forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(function HoverCardContent({ className, align = "start", sideOffset = 8, ...props }, ref) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-lg bg-elevated p-2 text-foreground shadow-lift outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  );
});
