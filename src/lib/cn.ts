import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, taught the project's own theme names (src/styles/globals.css), so an
 * override wins over a default: `cn("shadow-soft", "shadow-lift")` keeps `shadow-lift`, and
 * `shadow-lift` is an elevation, not a shadow colour.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["soft", "lift"],
      ease: ["standard", "emphasized", "exit"],
      font: ["display", "sans", "mono"],
    },
    classGroups: {
      duration: [{ duration: ["instant", "fast", "base", "slow", "deliberate"] }],
    },
  },
});

/** Joins class names and resolves conflicting Tailwind utilities (the last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
