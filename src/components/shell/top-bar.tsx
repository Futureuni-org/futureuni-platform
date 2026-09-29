"use client";

import { Command, Search } from "lucide-react";
import { useState } from "react";

import { Kbd } from "@/components/ui/kbd";
import { CommandPalette } from "@/components/patterns/command-palette";
import { useRegisteredShortcuts, useShortcut } from "@/components/patterns/shortcuts";
import { cn } from "@/lib/cn";

import { NotificationBell, type ShellNotification } from "./notification-bell";
import { UserMenu, type ShellUser } from "./user-menu";

interface NavigateLink {
  id: string;
  label: string;
  href: string;
  module: string;
}

export function TopBar({
  user,
  notifications,
  unread,
  navigate,
  markAllReadAction,
  className,
}: {
  user: ShellUser;
  notifications: ShellNotification[];
  unread: number;
  navigate: NavigateLink[];
  markAllReadAction: () => Promise<void>;
  className?: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcut("?", () => {
    setHelpOpen((was) => !was);
  }, { description: "Show keyboard shortcuts" });
  // The shortcuts overlay itself is deliberately lightweight — see ShortcutsOverlay below.

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur",
          className,
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <PaletteTrigger />
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell
            initial={notifications}
            unread={unread}
            timezone={user.timezone}
            markAllReadAction={markAllReadAction}
          />
          <UserMenu user={user} />
        </div>
      </header>
      <CommandPalette navigate={navigate} />
      <ShortcutsOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

function PaletteTrigger() {
  return (
    <label className="hidden md:inline-flex">
      <span className="sr-only">Search or run a command</span>
      <span
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }
        }}
        onClick={() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
        className={cn(
          "inline-flex h-10 min-w-72 items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-muted",
          "hover:bg-primary-soft/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1">Search or run a command…</span>
        <span className="flex items-center gap-1 text-xs">
          <Kbd>
            <Command aria-hidden className="mr-0.5 size-3" />K
          </Kbd>
        </span>
      </span>
    </label>
  );
}

function ShortcutsOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shortcuts = useRegisteredShortcuts();
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => {
        onOpenChange(false);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-elevated p-6 text-foreground shadow-lift"
      >
        <p className="font-display text-lg font-semibold text-heading">Keyboard shortcuts</p>
        <p className="mt-1 text-sm text-muted">
          Shortcuts on this screen. Press <Kbd>?</Kbd> to toggle.
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {shortcuts.length === 0 && (
            <li className="text-sm text-muted">No shortcuts registered for this view.</li>
          )}
          {shortcuts.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{entry.description || entry.chord.join(", ")}</span>
              <span className="flex items-center gap-1">
                {entry.chord.map((chord) => (
                  <Kbd key={chord}>{chord}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

