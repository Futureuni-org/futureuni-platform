import { Section } from "@/components/patterns/section";

export default function TypographyGalleryPage() {
  return (
    <Section title="Typography">
      <div className="flex flex-col gap-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Eyebrow</p>
          <h1 className="font-display text-[clamp(2rem,1.4rem+2vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-heading">
            Display heading — the greeting scale
          </h1>
        </div>
        <div>
          <h2 className="font-display text-3xl font-semibold text-heading">Section title (H2)</h2>
          <h3 className="text-xl font-semibold text-heading">Subheading (H3)</h3>
          <p className="max-w-prose text-lg text-foreground">
            Instrument Sans body copy. Comfortable at 16–18px, reads well at every viewport we
            target. It never has to compete with the display face because sections are separated
            by space, not boxes.
          </p>
        </div>
        <p className="font-mono tabular-nums text-sm text-foreground">
          Data face · ₦4,200,500 · $6,800 · £2,150.50
        </p>
      </div>
    </Section>
  );
}
