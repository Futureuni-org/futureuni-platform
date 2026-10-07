"use client";

import { Command, Search } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { CommandPalette } from "@/components/patterns/command-palette";
import { useRegisteredShortcuts, useShortcut } from "@/components/patterns/shortcuts";
import { cn } from "@/lib/cn";

import { Logo } from "./logo";
import { NotificationBell, type ShellNotification } from "./notification-bell";
import { UserMenu, type ShellUser } from "./user-menu";

/** Opens the command palette by replaying its global shortcut. */
function openPalette(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
}

const noopSubscribe = () => () => undefined;

/** True on Apple platforms (⌘), false elsewhere (Ctrl). Server renders the ⌘ variant. */
function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent),
    () => true,
  );
}

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
          {/* Below md the sidebar (which carries the brand) is hidden, so the top bar shows it. */}
          <Link
            href="/"
            aria-label="FUTUREUNI home"
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-md text-heading md:hidden",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Logo className="[&>img]:h-7 [&>span]:text-base" />
          </Link>
          <PaletteTrigger />
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            aria-label="Search or run a command"
            className="md:hidden"
            onClick={openPalette}
          >
            <Search aria-hidden className="size-5" />
          </IconButton>
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
  const apple = useIsApplePlatform();
  return (
    <button
      type="button"
      onClick={openPalette}
      className={cn(
        "hidden h-10 min-w-72 items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-muted md:inline-flex",
        "hover:bg-primary-soft/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Search aria-hidden className="size-4" />
      <span className="flex-1 text-left">Search or run a command…</span>
      <span className="flex items-center gap-1 text-xs">
        <Kbd>
          {apple ? <Command aria-hidden className="mr-0.5 size-3" /> : <span className="mr-0.5">Ctrl</span>}
          K
        </Kbd>
      </span>
    </button>
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
  // The Dialog primitive supplies the focus trap, Esc-to-close and focus return.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <div>
          <DialogTitle className="text-lg">Keyboard shortcuts</DialogTitle>
          <p className="mt-1 text-sm text-muted">
            Shortcuts on this screen. Press <Kbd>?</Kbd> to toggle.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
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
      </DialogContent>
    </Dialog>
  );
}

