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
export function Sidebar({ navigation }: { navigation: NavigationGroup[] }) {
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
        "sticky top-0 hidden h-dvh shrink-0 flex-col justify-between bg-sidebar text-sidebar-foreground md:flex",
        "border-r border-sidebar-foreground/10",
        "transition-[width] duration-fast ease-standard",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 py-4",
          collapsed ? "flex-col px-2" : "justify-between px-4",
        )}
      >
        <Logo collapsed={collapsed} />
        <IconButton
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="ghost"
          onClick={toggle}
          className="size-9 min-h-9 text-sidebar-foreground hover:bg-sidebar-foreground/10"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className="size-5" />
          ) : (
            <PanelLeftClose aria-hidden className="size-5" />
          )}
        </IconButton>
      </div>
      <div className="flex-1 [scrollbar-width:none] overflow-y-auto px-2 py-3 [&::-webkit-scrollbar]:hidden">
        <NavTree groups={navigation} collapsed={collapsed} />
      </div>
      {collapsed ? null : (
        <div className="px-4 py-4 text-xs text-sidebar-foreground/50">
          <span>FUTUREUNI · Internal</span>
        </div>
      )}
    </aside>
  );
}
