import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Section } from "@/components/patterns/section";

const SECTIONS = [
  { href: "/dev/ui", label: "UI gallery", description: "Every primitive, pattern and state." },
];

export default function DevIndexPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Developer"
        title="Internal tools"
        description="Shortcuts for working on the platform. Admin-only in production."
      />
      <Section title="Areas">
        <ul className="flex flex-col divide-y divide-border">
          {SECTIONS.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="flex items-center justify-between gap-4 py-3 hover:text-primary"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{entry.label}</span>
                  <span className="text-sm text-muted">{entry.description}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
