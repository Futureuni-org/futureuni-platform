"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "./select";
import { cn } from "@/lib/cn";

/**
 * URL-synced filter controls (B3.8: filters live in the URL so a view is shareable). These use
 * `next/navigation` directly rather than nuqs (not yet mounted platform-wide). Writing a param
 * triggers a server re-render of the page with the new searchParams.
 */

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      // Reset cursor pagination whenever a filter changes.
      next.delete("cursor");
      const qs = next.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end", className)}>
      {children}
    </div>
  );
}

export function UrlSearchInput({
  paramKey = "q",
  placeholder = "Search",
  label,
  className,
}: {
  paramKey?: string;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const [value, setValue] = useState(searchParams.get(paramKey) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(next: string) {
    setValue(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setParam(paramKey, next.trim() || null); }, 300);
  }

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); }}
        className="pl-9"
      />
    </div>
  );
}

export function UrlDateInput({
  paramKey,
  label,
  className,
}: {
  paramKey: string;
  label: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const current = searchParams.get(paramKey) ?? "";

  return (
    <label className={cn("flex min-w-[9rem] flex-col gap-1 text-sm", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <Input
        type="date"
        aria-label={label}
        value={current}
        onChange={(e) => { setParam(paramKey, e.target.value || null); }}
      />
    </label>
  );
}

export function UrlSelect({
  paramKey,
  options,
  label,
  allLabel = "All",
  className,
}: {
  paramKey: string;
  options: SelectOption[];
  label: string;
  allLabel?: string;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const setParam = useSetParam();
  const current = searchParams.get(paramKey) ?? "";

  return (
    <label className={cn("flex min-w-[10rem] flex-col gap-1 text-sm", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <Select
        aria-label={label}
        value={current}
        options={[{ value: "", label: allLabel }, ...options]}
        onChange={(e) => { setParam(paramKey, e.target.value || null); }}
      />
    </label>
  );
}
