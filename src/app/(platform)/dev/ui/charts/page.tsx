"use client";

import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { Sparkline } from "@/components/charts/sparkline";
import { Section } from "@/components/patterns/section";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TREND = WEEK.map((day, index) => ({
  x: day,
  Nigeria: 8 + Math.round(Math.sin(index) * 4 + index * 2),
  International: 4 + Math.round(Math.cos(index) * 3 + index),
}));

const REPLIES = [
  { x: "Web", INTERESTED: 4, "Not now": 2, Objections: 1 },
  { x: "UI/UX", INTERESTED: 3, "Not now": 4, Objections: 2 },
  { x: "Graphic", INTERESTED: 2, "Not now": 3, Objections: 3 },
  { x: "Video", INTERESTED: 5, "Not now": 2, Objections: 2 },
];

export default function ChartsGalleryPage() {
  return (
    <div className="flex flex-col gap-10">
      <Section title="Line chart">
        <LineChart
          title="Reply volume, last 7 days"
          summary="Interested replies rose Wed–Fri across both markets."
          data={TREND}
          series={[
            { key: "Nigeria", label: "Nigeria" },
            { key: "International", label: "International" },
          ]}
        />
      </Section>
      <Section title="Bar chart">
        <BarChart
          title="Replies by class, by service line"
          summary="UI/UX shows the highest 'not now' rate; Video has the most 'interested'."
          data={REPLIES}
          series={[
            { key: "INTERESTED", label: "Interested" },
            { key: "Not now", label: "Not now" },
            { key: "Objections", label: "Objections" },
          ]}
        />
      </Section>
      <Section title="Sparkline">
        <div className="flex items-center gap-3 text-sm">
          <span>New leads</span>
          <Sparkline data={[4, 6, 5, 8, 10, 9, 14]} ariaLabel="new leads trend" />
          <span className="font-mono">+18%</span>
        </div>
      </Section>
    </div>
  );
}
