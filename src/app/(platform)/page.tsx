"use client";

import Image from "next/image";

import { cn } from "@/lib/cn";
import { THEME_PREFERENCES, type ThemePreference, useTheme } from "@/lib/theme";

/**
 * Placeholder home: proves the tokens, fonts and theme switch work in both themes.
 * Phase 1 created it; Phase 4 replaces it with the platform home.
 */

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

// Class names are written out in full so Tailwind can find them.
const SWATCH_GROUPS: { title: string; swatches: { token: string; className: string }[] }[] = [
  {
    title: "Surfaces",
    swatches: [
      { token: "background", className: "bg-background" },
      { token: "zone", className: "bg-zone" },
      { token: "surface", className: "bg-surface" },
      { token: "elevated", className: "bg-elevated" },
    ],
  },
  {
    title: "Text and brand",
    swatches: [
      { token: "heading", className: "bg-heading" },
      { token: "foreground", className: "bg-foreground" },
      { token: "muted", className: "bg-muted" },
      { token: "subtle", className: "bg-subtle" },
      { token: "primary", className: "bg-primary" },
      { token: "primary-soft", className: "bg-primary-soft" },
      { token: "accent", className: "bg-accent" },
      { token: "input", className: "bg-input" },
    ],
  },
  {
    title: "Status",
    swatches: [
      { token: "success", className: "bg-success" },
      { token: "warning", className: "bg-warning" },
      { token: "danger", className: "bg-danger" },
      { token: "info", className: "bg-info" },
    ],
  },
  {
    title: "Chart series",
    swatches: [
      { token: "chart-1", className: "bg-chart-1" },
      { token: "chart-2", className: "bg-chart-2" },
      { token: "chart-3", className: "bg-chart-3" },
      { token: "chart-4", className: "bg-chart-4" },
      { token: "chart-5", className: "bg-chart-5" },
      { token: "chart-6", className: "bg-chart-6" },
      { token: "chart-7", className: "bg-chart-7" },
      { token: "chart-8", className: "bg-chart-8" },
    ],
  },
];

export default function ScaffoldHome() {
  const { preference, theme, setPreference } = useTheme();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-10">
        <div className="flex items-center gap-4">
          <Image src="/brand/futureuni-mark.png" alt="" width={37} height={48} preload />
          <span className="font-display text-2xl font-semibold tracking-[0.02em] text-heading">
            FUTUREUNI
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            Internal platform
          </p>
          <h1 className="text-[clamp(2.5rem,1.6rem+4vw,4.5rem)] leading-[1.05] font-semibold tracking-[-0.025em]">
            Scaffold ready
          </h1>
          <p className="max-w-prose text-lg text-muted">
            The foundation is in place: brand tokens, fonts, strict tooling and the ownership guard.
            The platform home replaces this page in Phase 4.
          </p>
        </div>

        <div role="group" aria-label="Theme" className="flex flex-wrap items-center gap-2">
          {THEME_PREFERENCES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={preference === option}
              onClick={() => {
                setPreference(option);
              }}
              className={cn(
                "min-h-12 rounded-md border border-input px-5 font-semibold transition-colors",
                preference === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-surface text-foreground hover:bg-primary-soft",
              )}
            >
              {THEME_LABELS[option]}
            </button>
          ))}
          <p className="ml-2 text-sm text-muted">Showing the {theme} theme.</p>
        </div>
      </header>

      <section aria-labelledby="tokens-heading" className="flex flex-col gap-8">
        <h2 id="tokens-heading" className="text-2xl font-semibold">
          Tokens
        </h2>
        {SWATCH_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{group.title}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {group.swatches.map((swatch) => (
                <li key={swatch.token} className="flex flex-col gap-2">
                  <span className={cn("h-12 rounded-md border border-border", swatch.className)} />
                  <span className="font-mono text-xs text-muted">{swatch.token}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section
        aria-labelledby="type-heading"
        className="flex flex-col gap-4 bg-zone px-4 py-8 sm:px-8"
      >
        <h2 id="type-heading" className="text-2xl font-semibold">
          Type
        </h2>
        <p className="font-display text-3xl font-semibold">Bricolage Grotesque for display</p>
        <p className="text-lg">Instrument Sans for body text and interface labels.</p>
        <p className="font-mono text-base tabular-nums">
          JetBrains Mono for data: ₦250,000 · $1,200 · £1,250.50
        </p>
      </section>
    </main>
  );
}
