"use client";

import { ChartFrame } from "@/components/charts";
import { chartSequential } from "@/lib/chart-theme";
import { useTheme } from "@/lib/theme";

import { formatPercent } from "../format";
import type { ReplyHeatmapResult } from "@/modules/acquisition/analytics";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Display order: Monday first (data weekday is 0=Sun … 6=Sat). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Reply-rate heatmap by weekday × hour in the recipient's local time (Phase 17), which informs
 * send windows. Cell shade scales with the reply rate using the sequential chart ramp; each cell
 * has an accessible tooltip. Empty cells use the neutral zone colour.
 */
export function HeatmapChart({ data }: { data: ReplyHeatmapResult }) {
  const { theme } = useTheme();
  const ramp = chartSequential(theme, "primary");
  const maxRate = Math.max(0, ...data.cells.map((c) => c.rate ?? 0)) || 1;

  const byCell = new Map(data.cells.map((c) => [`${String(c.weekday)}-${String(c.hour)}`, c]));

  const columns = ["Weekday", "Hour", "Sent", "Replied", "Reply rate"];
  const rows = data.cells
    .filter((c) => c.sent > 0)
    .map((c) => [
      WEEKDAY_LABELS[WEEKDAY_ORDER.indexOf(c.weekday)] ?? String(c.weekday),
      `${String(c.hour).padStart(2, "0")}:00`,
      c.sent,
      c.replied,
      c.rate === null ? "—" : formatPercent(c.rate),
    ]);

  function shade(rate: number | null, sent: number): string {
    if (sent === 0) return "var(--zone)";
    const bucket = Math.min(ramp.length - 1, Math.floor(((rate ?? 0) / maxRate) * ramp.length));
    return ramp[bucket] ?? ramp[ramp.length - 1] ?? "var(--primary)";
  }

  return (
    <ChartFrame
      title="Reply rate by weekday and hour"
      summary="Reply rate for sends made at each weekday and hour, in the recipient's local time."
      columns={columns}
      rows={rows}
      height={260}
      empty={data.totalSent === 0}
    >
      <div className="flex h-full flex-col gap-1 overflow-x-auto">
        <div className="flex items-center gap-1 pl-10 text-[10px] text-subtle">
          {HOURS.map((h) => (
            <span key={h} className="w-4 shrink-0 text-center">
              {h % 6 === 0 ? h : ""}
            </span>
          ))}
        </div>
        {WEEKDAY_ORDER.map((weekday, i) => (
          <div key={weekday} className="flex items-center gap-1">
            <span className="w-9 shrink-0 text-right text-[10px] text-muted">{WEEKDAY_LABELS[i]}</span>
            {HOURS.map((hour) => {
              const cell = byCell.get(`${String(weekday)}-${String(hour)}`);
              const sent = cell?.sent ?? 0;
              const rate = cell?.rate ?? null;
              return (
                <span
                  key={hour}
                  className="h-4 w-4 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: shade(rate, sent) }}
                  title={`${WEEKDAY_LABELS[i] ?? ""} ${String(hour).padStart(2, "0")}:00 — ${String(sent)} sent, ${rate === null ? "no" : formatPercent(rate)} reply rate`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}
