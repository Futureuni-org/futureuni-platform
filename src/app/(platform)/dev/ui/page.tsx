import { Section } from "@/components/patterns/section";
import { StatRow } from "@/components/patterns/stat-row";
import { Sparkline } from "@/components/charts/sparkline";

const TREND = [4, 6, 5, 8, 7, 12, 10, 15];

export default function UiOverviewPage() {
  return (
    <div className="flex flex-col gap-10">
      <Section eyebrow="Composite" title="A finished acquisition screen" emphasized>
        <StatRow
          stats={[
            {
              id: "leads",
              label: "New leads",
              value: "128",
              sparkline: <Sparkline data={TREND} serviceLine="WEB_DEVELOPMENT" ariaLabel="new leads trend" />,
              delta: { value: "+18%", good: true },
            },
            {
              id: "replies",
              label: "Reply rate",
              value: "9.4%",
              delta: { value: "+2.1pp", good: true },
            },
            {
              id: "meetings",
              label: "Meetings booked",
              value: "14",
              delta: { value: "-2", good: false },
            },
            {
              id: "pipeline",
              label: "Pipeline (₦)",
              value: "18.4m",
              delta: { value: "+₦4.2m", good: true },
            },
          ]}
        />
      </Section>
      <Section
        eyebrow="Introduction"
        title="What lives here"
        description="Every page below shows a representative slice of the design system in realistic content. Flip the theme with the user menu (⌘K → 'Theme') to check dark mode."
      >
        <p className="max-w-prose text-muted">
          The gallery is a working reference for Phases 15–18. Screens compose from the patterns
          under Buttons, Inputs, Badges and States, with data-dense content built on the DataTable
          and KanbanBoard patterns that Phase 4 seeds and Phases 15–17 finish.
        </p>
      </Section>
    </div>
  );
}
