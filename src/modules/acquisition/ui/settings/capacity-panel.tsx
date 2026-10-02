"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SettingsSection } from "@/components/admin";
import { StatRow, type Stat } from "@/components/patterns/stat-row";
import { Badge } from "@/components/ui/badge";

export interface CapacitySummary {
  mode: "NORMAL" | "SLOW" | "PAUSED";
  dailyCap: number;
  newFirstTouchesToday: number;
  remaining: number;
  percent: number;
  reason: string;
  capacity: number;
  load: number;
  nurtureHeld: number;
}

const MODE_TONE = { NORMAL: "success", SLOW: "warning", PAUSED: "danger" } as const;

export function CapacityPanel({ summary }: { summary: CapacitySummary }) {
  const stats: Stat[] = [
    { id: "capacity", label: "Capacity", value: String(summary.capacity), hint: "Weekly, across owners" },
    { id: "load", label: "Current load", value: String(summary.load), hint: `${String(summary.percent)}% of capacity` },
    { id: "today", label: "First touches today", value: `${String(summary.newFirstTouchesToday)} / ${String(summary.dailyCap)}` },
    { id: "nurture", label: "Held in nurture", value: String(summary.nurtureHeld), hint: "Capacity holds" },
  ];

  return (
    <SettingsSection
      eyebrow="Capacity"
      title="This line's capacity"
      emphasized
      actions={
        <Link
          href="/admin/team"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Manage team <ArrowRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Throttle</span>
        <Badge tone={MODE_TONE[summary.mode]}>{summary.mode}</Badge>
        {summary.reason !== "" && <span className="text-sm text-muted">· {summary.reason}</span>}
      </div>
      <StatRow stats={stats} />
    </SettingsSection>
  );
}
