"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Write filters, toggles and selections to the URL (B3.8), so every view can be shared. A `null` or
 * empty value removes the param. Changing anything resets cursor pagination. Uses `next/navigation`
 * directly: nuqs is installed but not mounted (see phases/16/REQUESTS.md).
 */
export function useUrlParams(): (
  updates: Record<string, string | null>,
  options?: { push?: boolean },
) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates, options) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("cursor");
      const qs = next.toString();
      const href = qs.length > 0 ? `${pathname}?${qs}` : pathname;
      if (options?.push === true) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
