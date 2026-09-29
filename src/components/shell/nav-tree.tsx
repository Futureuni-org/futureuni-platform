"use client";

import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement } from "react";
import type { LucideIcon } from "lucide-react";

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
      {groups.map((group) => {
        const moduleIcon = resolveIcon(group.moduleIcon);
        return (
          <div key={group.module} className="flex flex-col gap-1">
            {collapsed !== true && (
              <p className="px-4 text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground/60">
                {group.moduleLabel}
              </p>
            )}
            {collapsed === true && (
              <span
                aria-label={group.moduleLabel}
                className="mx-auto flex size-8 items-center justify-center rounded-md text-primary-foreground/70"
              >
                {createElement(moduleIcon, { "aria-hidden": true, className: "size-4" })}
              </span>
            )}
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <NavLink key={item.id} item={item} collapsed={collapsed} isActive={isActive(pathname, item.href)} />
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function NavLink({
  item,
  collapsed,
  isActive,
}: {
  item: NavigationEntry;
  collapsed?: boolean | undefined;
  isActive: boolean;
}) {
  const icon = resolveIcon(item.icon);
  return (
    <li>
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "reading-rule flex items-center gap-3 pl-4 pr-3 py-2 text-sm text-primary-foreground/80",
          "hover:bg-white/5 hover:text-primary-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "aria-[current=page]:text-primary-foreground aria-[current=page]:bg-white/5",
        )}
      >
        {createElement(icon, {
          "aria-hidden": true,
          className: "size-4 shrink-0 text-primary-foreground/60",
        })}
        {collapsed !== true && <span className="truncate">{item.label}</span>}
      </Link>
      {collapsed !== true && item.children !== undefined && item.children.length > 0 && (
        <ul className="ml-7 mt-0.5 flex flex-col border-l border-white/10 pl-3">
          {item.children.map((child) => (
            <NavLink key={child.id} item={child} isActive={false} />
          ))}
        </ul>
      )}
    </li>
  );
}
