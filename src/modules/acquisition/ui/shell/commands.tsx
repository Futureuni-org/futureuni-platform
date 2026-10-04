"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { registerCommand } from "@/components/patterns";

/**
 * Registers Client-Acquisition command-palette entries for the lines and sections the viewer can
 * reach ("Go to Web Development › Review", "Run a search in …", "Open review queue"). The server
 * computes the accessible set and passes it here; this island just wires each to a navigation.
 */

export interface ShellCommand {
  id: string;
  label: string;
  group: "Navigate" | "Actions";
  href: string;
}

export function CommandRegistrar({ commands }: { commands: ShellCommand[] }): null {
  const router = useRouter();

  useEffect(() => {
    const unregister = commands.map((command) =>
      registerCommand({
        id: command.id,
        label: command.label,
        group: command.group,
        perform: () => {
          router.push(command.href);
        },
      }),
    );
    return () => {
      for (const u of unregister) u();
    };
  }, [commands, router]);

  return null;
}
