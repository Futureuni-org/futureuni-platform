"use client";

import { LogOut, User } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

import { ThemeToggleMenu } from "./theme-toggle";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  serviceLines: readonly string[];
  timezone: string;
}

export function UserMenu({ user, className }: { user: ShellUser; className?: string }) {
  const router = useRouter();

  async function signOut() {
    // Better Auth signs out via a POST to /api/auth/sign-out and clears the cookie.
    try {
      await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" });
    } finally {
      router.push("/signed-out");
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative inline-flex min-h-10 items-center gap-2 rounded-full p-1 pr-3 text-sm hover:bg-primary-soft",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "pointer-coarse:after:absolute pointer-coarse:after:-inset-1 pointer-coarse:after:content-['']",
          className,
        )}
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar name={user.name} src={user.image} size="sm" />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block font-medium text-foreground">{user.name}</span>
          <span className="block text-xs uppercase tracking-wide text-muted">{user.role}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[14rem]">
        <DropdownMenuLabel>
          <span className="block text-sm font-medium text-foreground">{user.name}</span>
          <span className="block text-xs font-normal text-muted normal-case tracking-normal">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeToggleMenu />
        <DropdownMenuItem
          onSelect={() => {
            router.push("/settings");
          }}
        >
          <User aria-hidden className="size-4 text-muted" />
          Your settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <LogOut aria-hidden className="size-4 text-muted" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
