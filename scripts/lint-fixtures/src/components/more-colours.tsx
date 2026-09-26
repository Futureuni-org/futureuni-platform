// Violations: hsl(), oklch() and a hex colour inside a template literal.
export function MoreColours({ tone }: { tone: string }) {
  const fill = "hsl(250 55% 53%)";
  const stroke = "oklch(0.55 0.2 280)";
  return <div className={`${tone} text-[#232849]`} style={{ fill, stroke }} />;
}
