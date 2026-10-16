"use client";

/**
 * Copies a form's public link. The href is built on the client from `window.location.origin`, so
 * one component works on localhost, on a preview deployment and in production without the server
 * needing to know its own public URL.
 */

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CopyFormLink({ slug, label = "Copy the link" }: { slug: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        const url = `${window.location.origin}/f/${slug}`;
        void navigator.clipboard
          .writeText(url)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2_000);
          })
          .catch(() => {
            setCopied(false);
          });
      }}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
