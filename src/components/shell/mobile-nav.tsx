"use client";

import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import type { NavigationEntry, NavigationGroup } from "./nav-tree";

/**
 * Bottom navigation for widths < md. Shows at most 5 items: Home + the top-level items from
 * the first (usually acquisition) module, capped at 5 total.
 */
export function MobileNav({ navigation }: { navigation: NavigationGroup[] }) {
  const pathname = usePathname();
  const items = buildMobileItems(navigation);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch justify-around border-t border-border bg-surface md:hidden"
    >
      {items.map((item) => {
        const icon = resolveIcon(item.icon);
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted",
              "aria-[current=page]:text-primary",
            )}
          >
            {createElement(icon, { "aria-hidden": true, className: "size-5" })}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function resolveIcon(name: string | undefined): LucideIcon {
  if (name === undefined) return LucideIcons.Circle;
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[name] ?? LucideIcons.Circle;
}

function buildMobileItems(navigation: NavigationGroup[]): NavigationEntry[] {
  const first: NavigationEntry[] = [];
  for (const group of navigation) {
    for (const item of group.items) {
      first.push(item);
      if (first.length >= 5) return first;
    }
  }
  return first;
}
