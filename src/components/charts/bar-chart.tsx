"use client";

import {
  Bar,
  BarChart as RechartsBar,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartAxes, chartSeries, chartTooltip } from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme";

import { ChartFrame } from "./chart-frame";

export function BarChart({
  title,
  summary,
  data,
  series,
  xKey = "x",
  stacked,
  horizontal,
  height = 240,
  className,
}: {
  title: string;
  summary: string;
  data: Record<string, string | number>[];
  series: { key: string; label: string }[];
  xKey?: string;
  stacked?: boolean;
  horizontal?: boolean;
  height?: number;
  className?: string;
}) {
  const { theme } = useTheme();
  const { grid, axis } = chartAxes(theme);
  const tooltip = chartTooltip(theme);
  const columns = [xKey, ...series.map((s) => s.label)];
  const rows = data.map((datum) => [
    String(datum[xKey] ?? ""),
    ...series.map((s) => String(datum[s.key] ?? "")),
  ]);

  return (
    <ChartFrame
      title={title}
      summary={summary}
      columns={columns}
      rows={rows}
      height={height}
      empty={data.length === 0}
      className={className}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBar
          data={data}
          layout={horizontal === true ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          {horizontal === true ? (
            <>
              <XAxis type="number" stroke={axis} fontSize={11} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis type="category" dataKey={xKey} stroke={axis} fontSize={11} tickLine={false} axisLine={{ stroke: grid }} width={80} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} stroke={axis} fontSize={11} tickLine={false} axisLine={{ stroke: grid }} />
              <YAxis stroke={axis} fontSize={11} tickLine={false} axisLine={{ stroke: grid }} width={30} />
            </>
          )}
          <Tooltip
            contentStyle={{
              background: tooltip.bg,
              color: tooltip.fg,
              border: "none",
              borderRadius: 8,
              boxShadow: "var(--shadow-lift)",
            }}
            cursor={{ fill: grid, opacity: 0.35 }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: axis }} />}
          {series.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              fill={chartSeries(theme, index)}
              {...(stacked === true ? { stackId: "stack" } : {})}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          ))}
        </RechartsBar>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
