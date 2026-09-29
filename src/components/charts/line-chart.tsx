"use client";

import {
  CartesianGrid,
  Line,
  LineChart as RechartsLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { chartAxes, chartSeries, chartTooltip } from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme";

import { ChartFrame } from "./chart-frame";

export interface LineDatum {
  x: string;
  [seriesKey: string]: string | number;
}

export function LineChart({
  title,
  summary,
  data,
  series,
  xKey = "x",
  height = 240,
  className,
}: {
  title: string;
  summary: string;
  data: LineDatum[];
  series: { key: string; label: string }[];
  xKey?: string;
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
        <RechartsLine data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke={axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: grid }}
          />
          <YAxis
            stroke={axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: grid }}
            width={30}
          />
          <Tooltip
            contentStyle={{
              background: tooltip.bg,
              color: tooltip.fg,
              border: "none",
              borderRadius: 8,
              boxShadow: "var(--shadow-lift)",
            }}
            cursor={{ stroke: grid }}
          />
          {series.map((entry, index) => (
            <Line
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              stroke={chartSeries(theme, index)}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </RechartsLine>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
