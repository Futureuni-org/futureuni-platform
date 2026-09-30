"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { Logo } from "./logo";
import { NavTree, type NavigationGroup } from "./nav-tree";

const COLLAPSED_KEY = "futureuni-sidebar-collapsed";

function subscribeStorage(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
  };
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * The desktop sidebar. Navy background, hairline right border. Collapses to icons-only; the
 * state is remembered per browser in localStorage. Hidden below `md` — mobile uses the bottom
 * navigation.
 */
export function Sidebar({
  navigation,
}: {
  navigation: NavigationGroup[];
}) {
  const initialCollapsed = useSyncExternalStore(subscribeStorage, readCollapsed, () => false);
  const [override, setOverride] = useState<boolean | null>(null);
  const collapsed = override ?? initialCollapsed;
  function setCollapsed(next: boolean): void {
    setOverride(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  function toggle() {
    setCollapsed(!collapsed);
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col justify-between bg-heading text-primary-foreground md:flex",
        "border-r border-white/5",
        "transition-[width] duration-fast ease-standard",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Logo collapsed={collapsed} />
        <IconButton
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="ghost"
          onClick={toggle}
          className="size-8 min-h-8 text-primary-foreground hover:bg-white/10"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <PanelLeftClose aria-hidden className="size-4" />
          )}
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-4">
        <NavTree groups={navigation} collapsed={collapsed} />
      </div>
      <div className="px-4 py-4 text-xs text-primary-foreground/50">
        {collapsed ? null : <span>FUTUREUNI · Internal</span>}
      </div>
    </aside>
  );
}
