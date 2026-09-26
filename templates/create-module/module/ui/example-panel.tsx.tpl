import type { ReactNode } from "react";

/**
 * An example server component. Build real screens with the shared components in
 * src/components/ (Phase 4) and the saas-ui skill; colours only through design tokens.
 */
export function ExamplePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-surface p-6">
      <h2 className="font-display text-xl text-heading">{title}</h2>
      <div className="mt-2 text-muted">{children}</div>
    </section>
  );
}
