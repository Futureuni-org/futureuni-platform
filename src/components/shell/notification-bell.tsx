"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, IconButton } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RelativeTime } from "@/components/ui/relative-time";
import { EmptyState } from "@/components/patterns/states";
import { cn } from "@/lib/cn";

export interface ShellNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Notification bell. Server passes down initial items + unread count; the client optimistically
 * marks read via the `markAllReadAction` server action.
 */
export function NotificationBell({
  initial,
  unread,
  timezone,
  markAllReadAction,
}: {
  initial: ShellNotification[];
  unread: number;
  timezone: string;
  markAllReadAction: () => Promise<void>;
}) {
  const [items, setItems] = useState(initial);
  const [unreadCount, setUnread] = useState(unread);

  async function markAll() {
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    try {
      await markAllReadAction();
    } catch {
      // If the server call fails, the optimistic UI stays for this session — the next fetch fixes it.
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton aria-label={`Notifications${unreadCount > 0 ? `, ${String(unreadCount)} unread` : ""}`}>
          <span className="relative inline-flex">
            <Bell aria-hidden className="size-5" />
            {unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </span>
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-semibold text-heading">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void markAll();
            }}
            disabled={unreadCount === 0}
            className="h-8 px-2 text-xs"
          >
            <CheckCheck aria-hidden className="size-3.5" />
            Mark all read
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState title="You're all caught up" description="Nothing needs your attention right now." />
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-b border-border/50 last:border-b-0">
                  <NotificationRow item={item} timezone={timezone} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-right">
          <Link
            href="/settings"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Preferences
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  item,
  timezone,
}: {
  item: ShellNotification;
  timezone: string;
}) {
  const isUnread = item.readAt === null;
  const content = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        isUnread && "reading-rule",
      )}
      data-active={isUnread ? "true" : undefined}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{item.title}</span>
        {item.body !== null && item.body !== "" && (
          <span className="line-clamp-2 text-xs text-muted">{item.body}</span>
        )}
        <RelativeTime value={item.createdAt} timezone={timezone} className="text-[11px]" />
      </span>
    </div>
  );
  return item.link === null ? (
    content
  ) : (
    <Link href={item.link} className="block hover:bg-primary-soft">
      {content}
    </Link>
  );
}
