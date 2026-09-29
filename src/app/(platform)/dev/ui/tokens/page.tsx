import { Section } from "@/components/patterns/section";

const SURFACE_TOKENS = [
  { name: "background", cls: "bg-background" },
  { name: "surface", cls: "bg-surface" },
  { name: "zone", cls: "bg-zone" },
  { name: "elevated", cls: "bg-elevated" },
];
const BRAND_TOKENS = [
  { name: "primary", cls: "bg-primary" },
  { name: "primary-soft", cls: "bg-primary-soft" },
  { name: "accent", cls: "bg-accent" },
];
const STATUS_TOKENS = [
  { name: "success", cls: "bg-success" },
  { name: "warning", cls: "bg-warning" },
  { name: "danger", cls: "bg-danger" },
  { name: "info", cls: "bg-info" },
];
const CHART_TOKENS = Array.from({ length: 8 }, (_, index) => ({
  name: `chart-${String(index + 1)}`,
  cls: `bg-chart-${String(index + 1)}`,
}));

export default function TokensGalleryPage() {
  return (
    <div className="flex flex-col gap-10">
      <TokenGrid title="Surfaces" tokens={SURFACE_TOKENS} />
      <TokenGrid title="Brand" tokens={BRAND_TOKENS} />
      <TokenGrid title="Status" tokens={STATUS_TOKENS} />
      <TokenGrid title="Chart" tokens={CHART_TOKENS} />
    </div>
  );
}

function TokenGrid({
  title,
  tokens,
}: {
  title: string;
  tokens: { name: string; cls: string }[];
}) {
  return (
    <Section title={title}>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tokens.map((token) => (
          <li key={token.name} className="flex flex-col gap-2">
            <span className={`h-12 rounded-md border border-border ${token.cls}`} />
            <span className="font-mono text-xs text-muted">{token.name}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
