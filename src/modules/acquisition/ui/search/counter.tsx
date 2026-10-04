"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotionSafe } from "@/lib/motion";

/**
 * A number that counts up to its target over a short tween. Honours reduced motion by snapping to
 * the value immediately. Used for the live search counters (fetched, new, matched, …).
 */

const DURATION_MS = 450;

export function Counter({ value, className }: { value: number; className?: string }): React.ReactElement {
  const reduced = useReducedMotionSafe();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced) {
      // No animation: the value is rendered directly below.
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    function tick(now: number): void {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
    };
  }, [value, reduced]);

  const shown = reduced ? value : display;
  return (
    <span className={className} aria-live="off">
      {shown.toLocaleString("en-GB")}
    </span>
  );
}
