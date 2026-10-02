"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface AdminNavItem {
  href: string;
  label: string;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: AdminNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate !== undefined ? { onClick: onNavigate } : {})}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "reading-rule bg-primary-soft pl-4 font-medium text-primary-soft-foreground"
                : "text-muted hover:bg-primary-soft/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The `/admin` secondary navigation. A sticky side rail on desktop; a Sheet triggered by a
 * "Sections" button on mobile. Items are the ones the viewer may open (computed on the server
 * from the permission matrix).
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = items.find((i) => isActive(pathname, i.href));

  return (
    <>
      {/* Mobile trigger */}
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-2">
              <Menu aria-hidden className="size-4" />
              {current?.label ?? "Sections"}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetTitle className="mb-4">Admin sections</SheetTitle>
            <NavLinks
              items={items}
              pathname={pathname}
              onNavigate={() => {
                setOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop rail */}
      <div className="hidden md:block">
        <div className="sticky top-8">
          <NavLinks items={items} pathname={pathname} />
        </div>
      </div>
    </>
  );
}
