"use client";

import * as LucideIcons from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createElement, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

import type { NavigationEntry, NavigationGroup } from "./nav-tree";

/**
 * Bottom navigation for widths < md: the two everyday destinations (Home and the acquisition
 * Overview) plus a Menu sheet carrying the full navigation tree, so every screen the sidebar
 * reaches is reachable on a phone. Safe-area aware (`env(safe-area-inset-bottom)`).
 */
export function MobileNav({ navigation }: { navigation: NavigationGroup[] }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = buildMobileItems(navigation);
  // The Menu lights up when the current page isn't one of the pinned destinations.
  const menuActive = !items.some((item) => isActive(pathname, item.href));

  return (
    <>
      {/*
        Sticky, not fixed: a `fixed inset-x-0` bar sizes to the initial containing block, so any
        transient overflow during streaming locks mobile Chrome's layout viewport wide and the
        bar stretches past the screen. Sticky keeps it pinned to the viewport bottom while taking
        its width from the properly-constrained layout column.
      */}
      <nav
        aria-label="Primary"
        className="sticky bottom-0 z-30 mt-auto border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex h-16 items-stretch justify-around">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "aria-[current=page]:font-semibold aria-[current=page]:text-primary",
                )}
              >
                {createElement(resolveIcon(item.icon), { "aria-hidden": true, className: "size-5" })}
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(true);
            }}
            aria-expanded={menuOpen}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              menuActive && "font-semibold text-primary",
            )}
          >
            <LucideIcons.Menu aria-hidden className="size-5" />
            <span className="whitespace-nowrap">Menu</span>
          </button>
        </div>
      </nav>
      <MobileMenuSheet
        navigation={navigation}
        pathname={pathname}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      />
    </>
  );
}

function MobileMenuSheet({
  navigation,
  pathname,
  open,
  onOpenChange,
}: {
  navigation: NavigationGroup[];
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-2 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="px-2 text-lg">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Every section of the platform.</SheetDescription>
        <div className="flex flex-col gap-5">
          {navigation.map((group) => (
            <div key={group.module} className="flex flex-col gap-1">
              <p className="px-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {group.moduleLabel}
              </p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <MobileMenuItem
                    key={item.id}
                    item={item}
                    pathname={pathname}
                    onNavigate={() => {
                      onOpenChange(false);
                    }}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileMenuItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationEntry;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActive(pathname, item.href);
  const children = item.children ?? [];
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-md px-2 text-sm font-medium text-foreground",
          "hover:bg-zone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          "aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-soft-foreground",
        )}
      >
        {createElement(resolveIcon(item.icon), {
          "aria-hidden": true,
          className: "size-4 shrink-0 text-muted",
        })}
        <span className="truncate">{item.label}</span>
      </Link>
      {children.length > 0 && (
        <ul className="ml-5 flex flex-col border-l border-border pl-2">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={child.href}
                aria-current={isActive(pathname, child.href) ? "page" : undefined}
                onClick={onNavigate}
                className={cn(
                  "flex min-h-12 items-center rounded-md px-2 text-sm text-muted",
                  "hover:bg-zone hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "aria-[current=page]:bg-primary-soft aria-[current=page]:font-medium aria-[current=page]:text-primary-soft-foreground",
                )}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
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

/**
 * The pinned destinations: Home (the first platform item) and the acquisition Overview (the
 * first item of the first module group), when they exist. Everything else lives in the Menu
 * sheet — pinning Settings or Admin here would crowd out the actual daily work screens.
 */
function buildMobileItems(navigation: NavigationGroup[]): NavigationEntry[] {
  const items: NavigationEntry[] = [];
  const home = navigation.flatMap((group) => group.items).find((item) => item.href === "/");
  if (home !== undefined) items.push(home);
  const moduleGroup = navigation.find(
    (group) => group.module !== "platform" && group.items.length > 0,
  );
  const overview = moduleGroup?.items[0];
  if (overview !== undefined) items.push(overview);
  return items;
}
