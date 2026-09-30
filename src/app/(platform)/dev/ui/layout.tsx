import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { Section } from "@/components/patterns/section";

const PAGES = [
  { href: "/dev/ui", label: "Overview" },
  { href: "/dev/ui/tokens", label: "Tokens" },
  { href: "/dev/ui/typography", label: "Typography" },
  { href: "/dev/ui/buttons", label: "Buttons" },
  { href: "/dev/ui/inputs", label: "Inputs" },
  { href: "/dev/ui/badges", label: "Badges" },
  { href: "/dev/ui/states", label: "States" },
  { href: "/dev/ui/charts", label: "Charts" },
];

export default function UiGalleryLayout({ children }: LayoutProps<"/dev/ui">) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Dev"
        title="UI gallery"
        description="Every primitive, pattern and chart shown with FUTUREUNI content. Use it to check finishes in both themes and at 375–1440px."
      />
      <Section>
        <nav className="flex flex-wrap gap-2 text-sm">
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="rounded-full border border-border bg-surface px-3 py-1 text-foreground hover:bg-primary-soft"
            >
              {page.label}
            </Link>
          ))}
        </nav>
      </Section>
      {children}
    </div>
  );
}
