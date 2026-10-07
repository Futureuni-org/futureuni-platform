"use client";

import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement } from "react";
import type { LucideIcon } from "lucide-react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/cn";

export interface NavigationEntry {
  id: string;
  label: string;
  href: string;
  icon?: string | undefined;
  children?: NavigationEntry[];
}

export interface NavigationGroup {
  module: string;
  moduleLabel: string;
  moduleIcon: string;
  items: NavigationEntry[];
}

function resolveIcon(name: string | undefined): LucideIcon {
  if (name === undefined) return LucideIcons.Circle;
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[name] ?? LucideIcons.Circle;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavTree({
  groups,
  collapsed,
  className,
}: {
  groups: NavigationGroup[];
  collapsed?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex flex-col gap-6", className)} aria-label="Sidebar">
      {groups.map((group) => (
        <div key={group.module} className="flex flex-col gap-1">
          {collapsed === true ? (
            <span aria-hidden className="mx-auto mb-1 h-px w-6 rounded bg-sidebar-foreground/15" />
          ) : (
            <p className="px-3 text-xs font-semibold tracking-[0.08em] text-sidebar-foreground/50 uppercase">
              {group.moduleLabel}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink key={item.id} item={item} collapsed={collapsed} pathname={pathname} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  item,
  collapsed,
  pathname,
}: {
  item: NavigationEntry;
  collapsed?: boolean | undefined;
  pathname: string;
}) {
  const icon = resolveIcon(item.icon);
  const active = isActive(pathname, item.href);
  const hasChildren = item.children !== undefined && item.children.length > 0;

  if (collapsed === true) {
    // Collapsed rail: a centered icon, with a hover flyout for the label and any sub-items.
    return (
      <li>
        <HoverCard openDelay={80} closeDelay={150}>
          <HoverCardTrigger asChild>
            <Link
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mx-auto flex size-10 items-center justify-center rounded-md text-sidebar-foreground/70",
                "hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                "aria-[current=page]:bg-sidebar-foreground/10 aria-[current=page]:text-sidebar-foreground",
              )}
            >
              {createElement(icon, { "aria-hidden": true, className: "size-5" })}
            </Link>
          </HoverCardTrigger>
          <HoverCardContent side="right" align="start" className="min-w-44">
            <Link
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-zone"
            >
              {item.label}
            </Link>
            {hasChildren && (
              <ul className="mt-1 flex flex-col border-t border-border pt-1">
                {item.children?.map((child) => (
                  <li key={child.id}>
                    <Link
                      href={child.href}
                      aria-current={isActive(pathname, child.href) ? "page" : undefined}
                      className="block rounded-md px-2 py-1.5 text-sm text-muted hover:bg-zone hover:text-foreground aria-[current=page]:text-foreground"
                    >
                      {child.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </HoverCardContent>
        </HoverCard>
      </li>
    );
  }

  // Expanded rail: full-width row, with nested children indented beneath.
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "reading-rule flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80",
          "hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
          "aria-[current=page]:bg-sidebar-foreground/10 aria-[current=page]:text-sidebar-foreground",
        )}
      >
        {createElement(icon, {
          "aria-hidden": true,
          className: "size-4 shrink-0 text-sidebar-foreground/60",
        })}
        <span className="truncate">{item.label}</span>
      </Link>
      {hasChildren && (
        <ul className="mt-0.5 ml-7 flex flex-col border-l border-sidebar-foreground/15 pl-3">
          {item.children?.map((child) => (
            <NavLink key={child.id} item={child} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}
