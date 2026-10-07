"use client";

import { Command as CommandPrimitive } from "cmdk";
import { LayoutGrid, Moon, Search, Sun, SunMoon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/cn";

import { useCommandRegistry, useShortcut } from "./shortcuts";

interface NavigateLink {
  id: string;
  label: string;
  href: string;
  module: string;
}

interface Props {
  navigate: NavigateLink[];
}

/**
 * Eyebrow styling scoped to cmdk's own heading node. `text-transform` and `letter-spacing`
 * inherit, so putting `uppercase tracking-wide` on the Group itself turns every item into
 * shouting capitals (the project bans uppercase outside eyebrow labels).
 */
const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs " +
  "[&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase " +
  "[&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted";

/**
 * CommandPalette — Cmd/Ctrl+K opens; groups: Navigate, Actions, Recent, Theme (project-rules
 * §3.5). Navigate items come from `getNavigation()` (flattened, filtered). Actions come from
 * `getCommands()` from the registry and any client-registered commands via `useCommand()`.
 * Recent items live in localStorage per viewer.
 */
export function CommandPalette({ navigate }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setPreference } = useTheme();
  const commands = useCommandRegistry();

  useShortcut(["Meta+K", "Control+K"], () => {
    setOpen((was) => !was);
  }, { description: "Open command palette", input: true });

  useShortcut("Escape", () => {
    setOpen(false);
  }, { description: "Close command palette", input: true, enabled: open });

  const recent = useRecent();

  function run(id: string, action: () => void): void {
    pushRecent(id);
    setOpen(false);
    action();
  }

  const themeOptions = useMemo(
    () =>
      [
        { id: "theme.light", label: "Light theme", icon: Sun, value: "light" },
        { id: "theme.dark", label: "Dark theme", icon: Moon, value: "dark" },
        { id: "theme.system", label: "System theme", icon: SunMoon, value: "system" },
      ] satisfies { id: string; label: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; value: ThemePreference }[],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false} className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <CommandPrimitive
          label="Command palette"
          className="flex flex-col overflow-hidden rounded-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search aria-hidden className="size-4 text-muted" />
            <CommandPrimitive.Input
              placeholder="Search actions, pages, settings…"
              className="h-8 flex-1 bg-transparent text-base text-foreground placeholder:text-subtle focus:outline-none"
            />
            <Kbd>Esc</Kbd>
          </div>
          <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
            <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted">
              Nothing matches that.
            </CommandPrimitive.Empty>

            {navigate.length > 0 && (
              <CommandPrimitive.Group heading="Navigate" className={GROUP_CLASS}>
                {navigate.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`nav ${item.module} ${item.label}`}
                    onSelect={() => {
                      run(item.id, () => {
                        router.push(item.href);
                      });
                    }}
                  >
                    <LayoutGrid aria-hidden className="size-4 text-muted" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-xs text-muted">{item.module}</span>
                  </CommandItem>
                ))}
              </CommandPrimitive.Group>
            )}

            {commands.length > 0 && (
              <CommandPrimitive.Group heading="Actions" className={GROUP_CLASS}>
                {commands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={`action ${command.label}`}
                    onSelect={() => {
                      run(command.id, command.perform);
                    }}
                  >
                    <span className="flex-1">{command.label}</span>
                    {command.shortcut !== undefined && <Kbd>{command.shortcut}</Kbd>}
                  </CommandItem>
                ))}
              </CommandPrimitive.Group>
            )}

            {recent.length > 0 && (
              <CommandPrimitive.Group heading="Recent" className={GROUP_CLASS}>
                {recent.map((entry) => {
                  const target =
                    navigate.find((item) => item.id === entry) ??
                    ({ label: entry, href: "/", id: entry } as NavigateLink);
                  return (
                    <CommandItem
                      key={entry}
                      value={`recent ${target.label}`}
                      onSelect={() => {
                        run(entry, () => {
                          router.push(target.href);
                        });
                      }}
                    >
                      <span className="flex-1">{target.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandPrimitive.Group>
            )}

            <CommandPrimitive.Group heading="Theme" className={GROUP_CLASS}>
              {themeOptions.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`theme ${option.label}`}
                  onSelect={() => {
                    run(option.id, () => {
                      setPreference(option.value);
                    });
                  }}
                >
                  <option.icon aria-hidden className="size-4 text-muted" />
                  <span className="flex-1">{option.label}</span>
                </CommandItem>
              ))}
            </CommandPrimitive.Group>
          </CommandPrimitive.List>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function CommandItem({
  value,
  onSelect,
  children,
  className,
}: {
  value: string;
  onSelect: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CommandPrimitive.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground",
        "aria-selected:bg-primary-soft aria-selected:text-primary-soft-foreground",
        className,
      )}
    >
      {children}
    </CommandPrimitive.Item>
  );
}

const RECENT_KEY = "futureuni-cmdk-recent";
const RECENT_LIMIT = 6;

function pushRecent(id: string): void {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const existing: string[] = raw === null ? [] : (JSON.parse(raw) as string[]);
    const next = [id, ...existing.filter((entry) => entry !== id)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be blocked (private mode, third-party context) — recent list quietly resets.
  }
}

function subscribeRecent(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("storage", listener);
  };
}

// Cached so getSnapshot returns a stable reference between changes (an uncached new array every
// call makes useSyncExternalStore loop forever — React #185).
let recentSnapshot: string[] = [];
function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: string[] = raw === null ? [] : (JSON.parse(raw) as string[]);
    if (
      parsed.length === recentSnapshot.length &&
      parsed.every((entry, index) => entry === recentSnapshot[index])
    ) {
      return recentSnapshot;
    }
    recentSnapshot = parsed;
    return recentSnapshot;
  } catch {
    return recentSnapshot;
  }
}

function useRecent(): string[] {
  return useSyncExternalStore(subscribeRecent, readRecent, () => recentSnapshot);
}
