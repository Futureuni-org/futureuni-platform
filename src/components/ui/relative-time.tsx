"use client";

import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNowStrict } from "date-fns";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

/**
 * Relative "3 hours ago" text with the absolute value in the viewer's timezone on hover / focus.
 * The client re-renders every 60s so the label stays fresh without a full route revalidation.
 */
export function RelativeTime({
  value,
  timezone,
  className,
}: {
  value: Date | string;
  timezone: string;
  className?: string;
}) {
  const date = typeof value === "string" ? new Date(value) : value;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Reference `now` so React re-invokes formatDistanceToNowStrict on each tick.
  const rel = now > 0 ? formatDistanceToNowStrict(date, { addSuffix: true }) : "";
  const absolute = formatInTimeZone(date, timezone, "d MMM yyyy, HH:mm zzz");

  return (
    <time
      dateTime={date.toISOString()}
      title={absolute}
      className={cn("text-muted", className)}
    >
      {rel}
    </time>
  );
}
